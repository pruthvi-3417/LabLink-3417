import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  DEFAULT_FAIR_USE_LIMIT_HOURS,
  DEFAULT_WEIGHTS,
  DEMO_NOW,
  DEMO_SCENARIO_DAY,
  formatLocalIso,
  parseIsoMs,
  round2,
} from '../engine/constants';
import { bookingsToIntervals, Interval, intervalsOverlap } from '../engine/constraints';
import { computeFairnessScore, computeUsedHoursInWindow, isSlotFreeOnEquipment, normalizeWeights } from '../engine/scoring';
import { db, handleFirestoreError, isFirebaseConfigured, OperationType } from '../lib/firebase';
import type {
  AllocationResult,
  AllocationWeights,
  Approval,
  AuditLog,
  Booking,
  BookingRequest,
  Department,
  Equipment,
  EquipmentDaySchedule,
  Laboratory,
  MaintenanceRecord,
  NotificationItem,
  Project,
  RoleRequest,
  SettingsDoc,
  TimeSlot,
  UsageLog,
  UserProfile,
  UserRole,
  WaitlistEntry,
} from '../types/models';
import { createSeedDataset, type LabLinkDataset } from './seed';

const LOCAL_STORAGE_KEY = 'lablink_demo_dataset_v1';
const LOCAL_MODE_KEY = 'lablink_repo_mode_v1';

export class TransactionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionConflictError';
  }
}

function nowIso(): string {
  return formatLocalIso(Date.now());
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function daysBetween(startIso: string, endIso: string): string[] {
  const startKey = startIso.slice(0, 10);
  const endKey = endIso.slice(0, 10);
  if (startKey === endKey) return [startKey];
  const days: string[] = [];
  let cur = new Date(`${startKey}T00:00:00`);
  const last = new Date(`${endKey}T00:00:00`);
  while (cur <= last && days.length < 14) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return days;
}

// Local Demo Storage helpers
export function loadLocalDataset(): LabLinkDataset {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LabLinkDataset;
      if (parsed && Array.isArray(parsed.equipment) && Array.isArray(parsed.departments)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  const fresh = createSeedDataset();
  saveLocalDataset(fresh);
  return fresh;
}

export function saveLocalDataset(ds: LabLinkDataset): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(ds));
  } catch {
    // ignore quota issues
  }
}

export function resetLocalDataset(): LabLinkDataset {
  const fresh = createSeedDataset();
  saveLocalDataset(fresh);
  return fresh;
}

export type RepoMode = 'firestore' | 'local-demo';

function readInitialMode(): RepoMode {
  if (!isFirebaseConfigured) return 'local-demo';
  try {
    const saved = localStorage.getItem(LOCAL_MODE_KEY);
    if (saved === 'local-demo' || saved === 'firestore') return saved;
  } catch {
    // ignore storage errors
  }
  return 'firestore';
}

class LabLinkRepository {
  private mode: RepoMode = readInitialMode();
  private listeners = new Set<() => void>();

  getMode(): RepoMode {
    return this.mode;
  }

  setMode(mode: RepoMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(LOCAL_MODE_KEY, mode);
    } catch {
      // ignore storage errors
    }
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  // --- Full Snapshot Load ---
  async fetchAll(user?: UserProfile | null): Promise<LabLinkDataset> {
    if (this.mode === 'local-demo' || !db) {
      return loadLocalDataset();
    }

    const seed = createSeedDataset();
    const isOfflineErr = (e: unknown) => {
      const code = (e as { code?: string })?.code ?? '';
      const msg = e instanceof Error ? e.message : String(e);
      return code === 'unavailable' || msg.includes('the client is offline');
    };
    // Publicly readable collections
    let deptsSnap, labsSnap, eqSnap, settingsSnap;
    try {
      [deptsSnap, labsSnap, eqSnap, settingsSnap] = await Promise.all([
        getDocs(collection(db, 'departments')).catch((e) => {
          if (!user && isOfflineErr(e)) throw e;
          return handleFirestoreError(e, OperationType.LIST, 'departments');
        }),
        getDocs(collection(db, 'laboratories')).catch((e) => {
          if (!user && isOfflineErr(e)) throw e;
          return handleFirestoreError(e, OperationType.LIST, 'laboratories');
        }),
        getDocs(collection(db, 'equipment')).catch((e) => {
          if (!user && isOfflineErr(e)) throw e;
          return handleFirestoreError(e, OperationType.LIST, 'equipment');
        }),
        getDocs(collection(db, 'settings')).catch((e) => {
          if (!user && isOfflineErr(e)) throw e;
          return handleFirestoreError(e, OperationType.LIST, 'settings');
        }),
      ]);
    } catch (err) {
      if (!user && isOfflineErr(err)) {
        return seed;
      }
      throw err;
    }

    const departments = deptsSnap.docs.map((d) => d.data() as Department);
    const laboratories = labsSnap.docs.map((d) => d.data() as Laboratory);
    const equipment = eqSnap.docs.map((d) => d.data() as Equipment);
    const settings = settingsSnap.docs.map((d) => d.data() as SettingsDoc);

    if (!user) {
      return {
        ...seed,
        departments: departments.length > 0 ? departments : seed.departments,
        laboratories: laboratories.length > 0 ? laboratories : seed.laboratories,
        equipment: equipment.length > 0 ? equipment : seed.equipment,
        settings: settings.length > 0 ? settings : seed.settings,
      };
    }

    const isStaff = user.role === 'faculty' || user.role === 'admin';
    const isAdmin = user.role === 'admin';

    const safeList = async <T>(path: string, qRef: ReturnType<typeof query> | ReturnType<typeof collection>): Promise<T[]> => {
      try {
        const snap = await getDocs(qRef);
        return snap.docs.map((d) => d.data() as T);
      } catch (err) {
        console.warn(`Firestore read warning on ${path}:`, err);
        return [];
      }
    };

    const [
      users,
      roleRequests,
      projects,
      bookingRequests,
      bookings,
      approvals,
      allocationResults,
      maintenance,
      notifications,
      usageLogs,
      waitlists,
      equipmentDaySchedules,
      auditLogs,
    ] = await Promise.all([
      isStaff ? safeList<UserProfile>('users', collection(db, 'users')) : Promise.resolve([user]),
      isAdmin
        ? safeList<RoleRequest>('roleRequests', collection(db, 'roleRequests'))
        : safeList<RoleRequest>('roleRequests', query(collection(db, 'roleRequests'), where('userId', '==', user.uid))),
      isStaff
        ? safeList<Project>('projects', collection(db, 'projects'))
        : safeList<Project>('projects', query(collection(db, 'projects'), where('ownerId', '==', user.uid))),
      isStaff
        ? safeList<BookingRequest>('bookingRequests', collection(db, 'bookingRequests'))
        : safeList<BookingRequest>('bookingRequests', query(collection(db, 'bookingRequests'), where('studentId', '==', user.uid))),
      isStaff
        ? safeList<Booking>('bookings', collection(db, 'bookings'))
        : safeList<Booking>('bookings', query(collection(db, 'bookings'), where('studentId', '==', user.uid))),
      isStaff ? safeList<Approval>('approvals', collection(db, 'approvals')) : Promise.resolve([]),
      isStaff ? safeList<AllocationResult>('allocationResults', collection(db, 'allocationResults')) : Promise.resolve([]),
      safeList<MaintenanceRecord>('maintenance', collection(db, 'maintenance')),
      isAdmin
        ? safeList<NotificationItem>('notifications', collection(db, 'notifications'))
        : safeList<NotificationItem>('notifications', query(collection(db, 'notifications'), where('userId', '==', user.uid))),
      isStaff
        ? safeList<UsageLog>('usageLogs', collection(db, 'usageLogs'))
        : safeList<UsageLog>('usageLogs', query(collection(db, 'usageLogs'), where('studentId', '==', user.uid))),
      isStaff
        ? safeList<WaitlistEntry>('waitlists', collection(db, 'waitlists'))
        : safeList<WaitlistEntry>('waitlists', query(collection(db, 'waitlists'), where('studentId', '==', user.uid))),
      safeList<EquipmentDaySchedule>('equipmentDaySchedules', collection(db, 'equipmentDaySchedules')),
      isStaff ? safeList<AuditLog>('auditLogs', collection(db, 'auditLogs')) : Promise.resolve([]),
    ]);

    return {
      users,
      roleRequests,
      departments: departments.length > 0 ? departments : seed.departments,
      laboratories: laboratories.length > 0 ? laboratories : seed.laboratories,
      equipment: equipment.length > 0 ? equipment : seed.equipment,
      projects,
      bookingRequests,
      bookings,
      approvals,
      allocationResults,
      maintenance,
      notifications,
      usageLogs,
      waitlists,
      settings: settings.length > 0 ? settings : seed.settings,
      equipmentDaySchedules,
      auditLogs,
    };
  }

  // --- Seed / Reset Demo Data ---
  async seedFirestoreDemo(actorId: string): Promise<void> {
    if (this.mode === 'local-demo' || !db) {
      resetLocalDataset();
      this.notify();
      return;
    }

    const seed = createSeedDataset();
    const allDocs: Array<{ col: string; data: { id: string } }> = [
      ...seed.settings.map((d) => ({ col: 'settings', data: d })),
      ...seed.departments.map((d) => ({ col: 'departments', data: d })),
      ...seed.laboratories.map((d) => ({ col: 'laboratories', data: d })),
      ...seed.equipment.map((d) => ({ col: 'equipment', data: d })),
      ...seed.users.map((d) => ({ col: 'users', data: d })),
      ...seed.projects.map((d) => ({ col: 'projects', data: d })),
      ...seed.bookingRequests.map((d) => ({ col: 'bookingRequests', data: d })),
      ...seed.bookings.map((d) => ({ col: 'bookings', data: d })),
      ...seed.maintenance.map((d) => ({ col: 'maintenance', data: d })),
      ...seed.usageLogs.map((d) => ({ col: 'usageLogs', data: d })),
      ...seed.equipmentDaySchedules.map((d) => ({ col: 'equipmentDaySchedules', data: d })),
      ...seed.notifications.map((d) => ({ col: 'notifications', data: d })),
      ...seed.waitlists.map((d) => ({ col: 'waitlists', data: d })),
      ...seed.roleRequests.map((d) => ({ col: 'roleRequests', data: d })),
    ];

    // Chunk writes <= 450 per batch
    for (let i = 0; i < allDocs.length; i += 400) {
      const batch = writeBatch(db);
      for (const item of allDocs.slice(i, i + 400)) {
        batch.set(doc(db, item.col, item.data.id), item.data);
      }
      await batch.commit().catch((e) => handleFirestoreError(e, OperationType.WRITE, 'demo-seed'));
    }

    const ts = nowIso();
    const audit: AuditLog = {
      id: uid('audit'),
      actorId,
      action: 'DEMO_DATASET_SEEDED',
      entityType: 'system',
      entityId: 'lablink-demo',
      detail: 'Admin seeded demo campus dataset into Firestore.',
      status: 'recorded',
      isDemo: true,
      createdAt: ts,
      updatedAt: ts,
    };
    await setDoc(doc(db, 'auditLogs', audit.id), audit).catch((e) =>
      handleFirestoreError(e, OperationType.CREATE, `auditLogs/${audit.id}`)
    );
    this.notify();
  }

  async loadDemoConflictScenario(actorId: string): Promise<void> {
    const seed = createSeedDataset();
    const scenarioReqIds = ['req-demo-a', 'req-demo-b', 'req-demo-c'];
    const scenarioReqs = seed.bookingRequests.filter((r) => scenarioReqIds.includes(r.id));
    const scenarioProjs = seed.projects.filter((p) => ['proj-a-objdet', 'proj-b-imgcls', 'proj-c-sim'].includes(p.id));
    const scenarioUsers = seed.users.filter((u) => ['user-student-a', 'user-student-b', 'user-student-c'].includes(u.id));
    const scenarioBookings = seed.bookings.filter((b) => ['bk-ws01-morning', 'bk-ws02-full-1', 'bk-ws02-full-2'].includes(b.id));
    const scenarioMaint = seed.maintenance.filter((m) => m.id === 'maint-ws01-d');
    const scenarioScheds = seed.equipmentDaySchedules.filter((s) => s.date === DEMO_SCENARIO_DAY);
    const scenarioLogs = seed.usageLogs.filter((u) => ['user-student-a', 'user-student-c'].includes(u.studentId));

    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const upsert = <T extends { id: string }>(arr: T[], incoming: T[]): T[] => {
        const map = new Map(arr.map((x) => [x.id, x]));
        for (const item of incoming) map.set(item.id, item);
        return Array.from(map.values());
      };
      ds.users = upsert(ds.users, scenarioUsers);
      ds.projects = upsert(ds.projects, scenarioProjs);
      ds.bookingRequests = upsert(ds.bookingRequests, scenarioReqs);
      ds.bookings = upsert(ds.bookings, scenarioBookings);
      ds.maintenance = upsert(ds.maintenance, scenarioMaint);
      ds.equipmentDaySchedules = upsert(ds.equipmentDaySchedules, scenarioScheds);
      ds.usageLogs = upsert(ds.usageLogs, scenarioLogs);
      saveLocalDataset(ds);
      this.notify();
      return;
    }

    const batch = writeBatch(db);
    for (const p of scenarioProjs) batch.set(doc(db, 'projects', p.id), p);
    for (const r of scenarioReqs) batch.set(doc(db, 'bookingRequests', r.id), r);
    for (const b of scenarioBookings) batch.set(doc(db, 'bookings', b.id), b);
    for (const m of scenarioMaint) batch.set(doc(db, 'maintenance', m.id), m);
    for (const s of scenarioScheds) batch.set(doc(db, 'equipmentDaySchedules', s.id), s);
    for (const l of scenarioLogs) batch.set(doc(db, 'usageLogs', l.id), l);
    await batch.commit().catch((e) => handleFirestoreError(e, OperationType.WRITE, 'scenario-seed'));
    const ts = nowIso();
    const auditId = uid('audit');
    await setDoc(doc(db, 'auditLogs', auditId), {
      id: auditId,
      actorId,
      action: 'SCENARIO_CONFLICT_LOADED',
      entityType: 'allocation',
      entityId: 'gpu-ws-01',
      detail: `Loaded Section 10 3-student GPU conflict scenario (DEMO_NOW=${DEMO_NOW}).`,
      status: 'recorded',
      isDemo: true,
      createdAt: ts,
      updatedAt: ts,
    }).catch((e) => handleFirestoreError(e, OperationType.CREATE, 'auditLogs'));
    this.notify();
  }

  // --- User Profile & Role Management ---
  async ensureUserProfile(profile: UserProfile): Promise<UserProfile> {
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const idx = ds.users.findIndex((u) => u.uid === profile.uid || u.email === profile.email);
      if (idx >= 0) {
        return ds.users[idx];
      }
      ds.users.push(profile);
      saveLocalDataset(ds);
      this.notify();
      return profile;
    }

    const ref = doc(db, 'users', profile.uid);
    const snap = await getDoc(ref).catch((e) => handleFirestoreError(e, OperationType.GET, `users/${profile.uid}`));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    await setDoc(ref, profile).catch((e) => handleFirestoreError(e, OperationType.CREATE, `users/${profile.uid}`));
    this.notify();
    return profile;
  }

  async updateUserProfile(userId: string, patch: Partial<Pick<UserProfile, 'displayName' | 'phone' | 'studentIdCode' | 'departmentId'>>): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.users = ds.users.map((u) => (u.id === userId ? { ...u, ...patch, updatedAt: ts } : u));
      saveLocalDataset(ds);
      this.notify();
      return;
    }
    await updateDoc(doc(db, 'users', userId), { ...patch, updatedAt: ts }).catch((e) =>
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`)
    );
    this.notify();
  }

  async createRoleRequest(req: Omit<RoleRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<RoleRequest> {
    const ts = nowIso();
    const docData: RoleRequest = {
      ...req,
      id: uid('rolereq'),
      status: 'pending',
      createdAt: ts,
      updatedAt: ts,
    };
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.roleRequests.unshift(docData);
      saveLocalDataset(ds);
      this.notify();
      return docData;
    }
    await setDoc(doc(db, 'roleRequests', docData.id), docData).catch((e) =>
      handleFirestoreError(e, OperationType.CREATE, `roleRequests/${docData.id}`)
    );
    this.notify();
    return docData;
  }

  async reviewRoleRequest(roleReqId: string, decision: 'approved' | 'rejected', adminId: string): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const rr = ds.roleRequests.find((r) => r.id === roleReqId);
      if (!rr) throw new Error('Role request not found.');
      rr.status = decision;
      rr.reviewedBy = adminId;
      rr.updatedAt = ts;
      if (decision === 'approved') {
        ds.users = ds.users.map((u) =>
          u.uid === rr.userId ? { ...u, role: rr.requestedRole, departmentApproved: true, updatedAt: ts } : u
        );
      }
      ds.notifications.unshift({
        id: uid('notif'),
        userId: rr.userId,
        type: 'role_updated',
        title: `Role Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your request for ${rr.requestedRole} access was ${decision} by an administrator.`,
        link: decision === 'approved' ? `/${rr.requestedRole}/dashboard` : '/student/profile',
        read: false,
        status: 'unread',
        isDemo: rr.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId: adminId,
        action: `ROLE_REQUEST_${decision.toUpperCase()}`,
        entityType: 'roleRequest',
        entityId: roleReqId,
        detail: `Set ${rr.email} role request to ${decision}.`,
        status: 'recorded',
        isDemo: rr.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }

    await runTransaction(db, async (tx) => {
      const rrRef = doc(db!, 'roleRequests', roleReqId);
      const rrSnap = await tx.get(rrRef);
      if (!rrSnap.exists()) throw new Error('Role request not found.');
      const rr = rrSnap.data() as RoleRequest;
      tx.update(rrRef, { status: decision, reviewedBy: adminId, updatedAt: ts });
      if (decision === 'approved') {
        tx.update(doc(db!, 'users', rr.userId), { role: rr.requestedRole, departmentApproved: true, updatedAt: ts });
      }
      const notifId = uid('notif');
      tx.set(doc(db!, 'notifications', notifId), {
        id: notifId,
        userId: rr.userId,
        type: 'role_updated',
        title: `Role Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your request for ${rr.requestedRole} access was ${decision}.`,
        link: decision === 'approved' ? `/${rr.requestedRole}/dashboard` : '/student/profile',
        read: false,
        status: 'unread',
        isDemo: rr.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
    }).catch((e) => handleFirestoreError(e, OperationType.WRITE, `roleRequests/${roleReqId}`));
    this.notify();
  }

  async adminUpdateUserRole(targetUid: string, role: UserRole, adminId: string): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.users = ds.users.map((u) => (u.uid === targetUid ? { ...u, role, departmentApproved: true, updatedAt: ts } : u));
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId: adminId,
        action: 'USER_ROLE_UPDATED',
        entityType: 'user',
        entityId: targetUid,
        detail: `Changed role to ${role}`,
        status: 'recorded',
        isDemo: false,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }
    await updateDoc(doc(db, 'users', targetUid), { role, departmentApproved: true, updatedAt: ts }).catch((e) =>
      handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`)
    );
    this.notify();
  }

  // --- Projects ---
  async createProject(input: Omit<Project, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const ts = nowIso();
    const project: Project = {
      ...input,
      id: uid('proj'),
      deadlineType: input.deadlineType ?? 'end_of_day',
      status: 'active',
      createdAt: ts,
      updatedAt: ts,
    };
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.projects.unshift(project);
      saveLocalDataset(ds);
      this.notify();
      return project;
    }
    await setDoc(doc(db, 'projects', project.id), project).catch((e) =>
      handleFirestoreError(e, OperationType.CREATE, `projects/${project.id}`)
    );
    this.notify();
    return project;
  }

  // --- Booking Requests ---
  async submitBookingRequest(
    input: Omit<BookingRequest, 'id' | 'status' | 'submittedAt' | 'createdAt' | 'updatedAt'>,
    facultyId: string
  ): Promise<BookingRequest> {
    const ts = nowIso();
    const reqDoc: BookingRequest = {
      ...input,
      id: uid('req'),
      status: 'pending_approval',
      submittedAt: ts,
      createdAt: ts,
      updatedAt: ts,
    };

    const notifStudent: NotificationItem = {
      id: uid('notif'),
      userId: input.studentId,
      type: 'request_submitted',
      title: 'Resource Request Submitted',
      message: `Your slot request (${input.requestedStart.slice(0, 16).replace('T', ' ')}) is pending faculty review.`,
      link: '/student/bookings',
      read: false,
      status: 'unread',
      isDemo: input.isDemo,
      createdAt: ts,
      updatedAt: ts,
    };

    const notifFaculty: NotificationItem = {
      id: uid('notif'),
      userId: facultyId,
      type: 'request_submitted',
      title: 'New Lab Access Request',
      message: `New request submitted for ${input.requestedStart.slice(0, 16).replace('T', ' ')}.`,
      link: `/faculty/requests/${reqDoc.id}`,
      read: false,
      status: 'unread',
      isDemo: input.isDemo,
      createdAt: ts,
      updatedAt: ts,
    };

    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.bookingRequests.unshift(reqDoc);
      ds.notifications.unshift(notifStudent, notifFaculty);
      saveLocalDataset(ds);
      this.notify();
      return reqDoc;
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'bookingRequests', reqDoc.id), reqDoc);
    batch.set(doc(db, 'notifications', notifStudent.id), notifStudent);
    await batch.commit().catch((e) => handleFirestoreError(e, OperationType.CREATE, `bookingRequests/${reqDoc.id}`));
    this.notify();
    return reqDoc;
  }

  // --- Transactional Faculty Approval / Modification ---
  async approveBookingRequest(params: {
    requestId: string;
    facultyId: string;
    slot: TimeSlot;
    equipmentId: string;
    isOverride: boolean;
    reason?: string;
    engineSnapshot?: Approval['engineSnapshot'];
  }): Promise<Booking> {
    const ts = nowIso();
    const bookingId = uid('bk');
    const approvalId = uid('appr');
    const notifId = uid('notif');
    const auditId = uid('audit');
    const days = daysBetween(params.slot.start, params.slot.end);

    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const req = ds.bookingRequests.find((r) => r.id === params.requestId);
      if (!req) throw new Error('Booking request not found.');
      if (['approved', 'rejected', 'cancelled', 'completed'].includes(req.status)) {
        throw new TransactionConflictError(`Request is already in terminal state "${req.status}".`);
      }
      const eq = ds.equipment.find((e) => e.id === params.equipmentId);
      if (!eq) throw new Error('Equipment not found.');
      const lab = ds.laboratories.find((l) => l.id === eq.laboratoryId);

      // Build intervals from schedules + active bookings
      const activeIntervals: Interval[] = bookingsToIntervals(ds.bookings, eq.id);
      const startMs = parseIsoMs(params.slot.start);
      const endMs = parseIsoMs(params.slot.end);

      if (!isSlotFreeOnEquipment(startMs, endMs, req.units, eq, lab, activeIntervals, ds.maintenance)) {
        throw new TransactionConflictError('Slot no longer available: conflicts with confirmed booking, maintenance, or lab operating hours.');
      }

      const isModified =
        params.equipmentId !== req.equipmentId ||
        params.slot.start !== req.requestedStart ||
        params.slot.end !== req.requestedEnd;

      const booking: Booking = {
        id: bookingId,
        requestId: req.id,
        studentId: req.studentId,
        projectId: req.projectId,
        equipmentId: eq.id,
        departmentId: eq.departmentId,
        start: params.slot.start,
        end: params.slot.end,
        units: req.units,
        status: 'approved',
        qrToken: `LABLINK-QR-${bookingId}`,
        approvedBy: params.facultyId,
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      };

      req.status = 'approved';
      req.equipmentId = eq.id;
      req.requestedStart = params.slot.start;
      req.requestedEnd = params.slot.end;
      req.aiScore = params.engineSnapshot?.totalScore;
      req.aiRecommendedSlot = params.slot;
      req.facultyNote = params.reason || (isModified ? 'Approved with modified slot/resource.' : 'Approved.');
      req.updatedAt = ts;

      for (const day of days) {
        const schedId = `${eq.id}_${day}`;
        let sched = ds.equipmentDaySchedules.find((s) => s.id === schedId);
        if (!sched) {
          sched = { id: schedId, equipmentId: eq.id, date: day, intervals: [], status: 'active', isDemo: eq.isDemo, createdAt: ts, updatedAt: ts };
          ds.equipmentDaySchedules.push(sched);
        }
        sched.intervals.push({ bookingId, start: params.slot.start, end: params.slot.end, units: req.units });
        sched.updatedAt = ts;
      }

      ds.bookings.unshift(booking);
      ds.approvals.unshift({
        id: approvalId,
        requestId: req.id,
        facultyId: params.facultyId,
        decision: isModified ? 'modified' : 'approved',
        isOverride: params.isOverride,
        reason: params.reason,
        engineSnapshot: params.engineSnapshot,
        status: 'recorded',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      ds.notifications.unshift({
        id: notifId,
        userId: req.studentId,
        type: 'request_approved',
        title: isModified ? 'Booking Approved (Modified Slot)' : 'Booking Request Approved',
        message: `${eq.name} confirmed for ${params.slot.start.slice(0, 16).replace('T', ' ')}–${params.slot.end.slice(11, 16)}.`,
        link: '/student/bookings',
        read: false,
        status: 'unread',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      ds.auditLogs.unshift({
        id: auditId,
        actorId: params.facultyId,
        action: params.isOverride ? 'FACULTY_OVERRIDE_APPROVAL' : 'FACULTY_APPROVAL',
        entityType: 'booking',
        entityId: bookingId,
        detail: `${isModified ? 'Modified & approved' : 'Approved'} ${req.id} on ${eq.equipmentId} (${params.slot.start}–${params.slot.end}).${params.reason ? ` Reason: ${params.reason}` : ''}`,
        status: 'recorded',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });

      saveLocalDataset(ds);
      this.notify();
      return booking;
    }

    // Real Firestore Transaction
    let createdBooking!: Booking;
    await runTransaction(db, async (tx) => {
      const reqRef = doc(db!, 'bookingRequests', params.requestId);
      const eqRef = doc(db!, 'equipment', params.equipmentId);
      const reqSnap = await tx.get(reqRef);
      const eqSnap = await tx.get(eqRef);

      if (!reqSnap.exists()) throw new Error('Booking request not found.');
      if (!eqSnap.exists()) throw new Error('Equipment not found.');

      const req = reqSnap.data() as BookingRequest;
      const eq = eqSnap.data() as Equipment;

      if (['approved', 'rejected', 'cancelled', 'completed'].includes(req.status)) {
        throw new TransactionConflictError(`Request already finalized (${req.status}).`);
      }

      const labSnap = await tx.get(doc(db!, 'laboratories', eq.laboratoryId));
      const lab = labSnap.exists() ? (labSnap.data() as Laboratory) : undefined;

      const schedRefs = days.map((d) => doc(db!, 'equipmentDaySchedules', `${eq.id}_${d}`));
      const schedSnaps = await Promise.all(schedRefs.map((r) => tx.get(r)));

      const rawIntervals: Array<{ bookingId: string; start: string; end: string; units: number }> = [];
      for (const sSnap of schedSnaps) {
        if (sSnap.exists()) {
          const sched = sSnap.data() as EquipmentDaySchedule;
          for (const iv of sched.intervals) {
            rawIntervals.push(iv);
          }
        }
      }

      // Filter out any bookings that were cancelled by their student owner
      const uniqueBkIds = Array.from(new Set(rawIntervals.map((iv) => iv.bookingId)));
      const bkSnaps = await Promise.all(uniqueBkIds.map((bid) => tx.get(doc(db!, 'bookings', bid))));
      const cancelledBkIds = new Set<string>();
      bkSnaps.forEach((bSnap, i) => {
        if (bSnap.exists() && (bSnap.data() as Booking).status === 'cancelled') {
          cancelledBkIds.add(uniqueBkIds[i]);
        }
      });

      const intervals: Interval[] = [];
      for (const iv of rawIntervals) {
        if (cancelledBkIds.has(iv.bookingId)) continue;
        intervals.push({
          id: iv.bookingId,
          startMs: parseIsoMs(iv.start),
          endMs: parseIsoMs(iv.end),
          units: iv.units,
        });
      }

      const maintSnap = await getDocs(query(collection(db!, 'maintenance'), where('equipmentId', '==', eq.id)));
      const maintRecords = maintSnap.docs.map((d) => d.data() as MaintenanceRecord);

      if (!isSlotFreeOnEquipment(parseIsoMs(params.slot.start), parseIsoMs(params.slot.end), req.units, eq, lab, intervals, maintRecords)) {
        throw new TransactionConflictError('Slot no longer available: capacity, maintenance, or lab-hours conflict detected inside transaction.');
      }

      const isModified =
        params.equipmentId !== req.equipmentId ||
        params.slot.start !== req.requestedStart ||
        params.slot.end !== req.requestedEnd;

      createdBooking = {
        id: bookingId,
        requestId: req.id,
        studentId: req.studentId,
        projectId: req.projectId,
        equipmentId: eq.id,
        departmentId: eq.departmentId,
        start: params.slot.start,
        end: params.slot.end,
        units: req.units,
        status: 'approved',
        qrToken: `LABLINK-QR-${bookingId}`,
        approvedBy: params.facultyId,
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      };

      tx.set(doc(db!, 'bookings', bookingId), createdBooking);
      tx.update(reqRef, {
        status: 'approved',
        equipmentId: eq.id,
        requestedStart: params.slot.start,
        requestedEnd: params.slot.end,
        aiScore: params.engineSnapshot?.totalScore ?? 0,
        aiRecommendedSlot: params.slot,
        facultyNote: params.reason || 'Approved',
        updatedAt: ts,
      });

      schedSnaps.forEach((sSnap, idx) => {
        const day = days[idx];
        const schedId = `${eq.id}_${day}`;
        const existingIntervals = sSnap.exists()
          ? ((sSnap.data() as EquipmentDaySchedule).intervals ?? []).filter((iv) => !cancelledBkIds.has(iv.bookingId))
          : [];
        const nextSched: EquipmentDaySchedule = {
          id: schedId,
          equipmentId: eq.id,
          date: day,
          intervals: [...existingIntervals, { bookingId, start: params.slot.start, end: params.slot.end, units: req.units }],
          status: 'active',
          isDemo: eq.isDemo,
          createdAt: sSnap.exists() ? (sSnap.data() as EquipmentDaySchedule).createdAt : ts,
          updatedAt: ts,
        };
        tx.set(schedRefs[idx], nextSched);
      });

      const approvalDoc: Approval = {
        id: approvalId,
        requestId: req.id,
        facultyId: params.facultyId,
        decision: isModified ? 'modified' : 'approved',
        isOverride: params.isOverride,
        reason: params.reason ?? '',
        engineSnapshot: params.engineSnapshot,
        status: 'recorded',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      };
      tx.set(doc(db!, 'approvals', approvalId), approvalDoc);

      const notifDoc: NotificationItem = {
        id: notifId,
        userId: req.studentId,
        type: 'request_approved',
        title: isModified ? 'Booking Approved (Modified Slot)' : 'Booking Request Approved',
        message: `${eq.name} confirmed for ${params.slot.start.slice(0, 16).replace('T', ' ')}–${params.slot.end.slice(11, 16)}.`,
        link: '/student/bookings',
        read: false,
        status: 'unread',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      };
      tx.set(doc(db!, 'notifications', notifId), notifDoc);

      const auditDoc: AuditLog = {
        id: auditId,
        actorId: params.facultyId,
        action: params.isOverride ? 'FACULTY_OVERRIDE_APPROVAL' : 'FACULTY_APPROVAL',
        entityType: 'booking',
        entityId: bookingId,
        detail: `${isModified ? 'Modified & approved' : 'Approved'} ${req.id} on ${eq.equipmentId}.`,
        status: 'recorded',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      };
      tx.set(doc(db!, 'auditLogs', auditId), auditDoc);
    }).catch((e) => {
      if (e instanceof TransactionConflictError) throw e;
      handleFirestoreError(e, OperationType.WRITE, `bookingRequests/${params.requestId}`);
    });

    this.notify();
    return createdBooking;
  }

  async facultyDecideOther(params: {
    requestId: string;
    facultyId: string;
    decision: 'rejected' | 'suggested_alternative' | 'more_info_requested';
    reason: string;
    suggestedSlot?: TimeSlot;
    isOverride: boolean;
    engineSnapshot?: Approval['engineSnapshot'];
  }): Promise<void> {
    const ts = nowIso();
    const approvalId = uid('appr');
    const notifId = uid('notif');
    const auditId = uid('audit');

    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const req = ds.bookingRequests.find((r) => r.id === params.requestId);
      if (!req) throw new Error('Request not found.');
      if (params.decision === 'rejected') {
        req.status = 'rejected';
      } else if (params.decision === 'suggested_alternative') {
        req.status = 'ai_recommended';
        if (params.suggestedSlot) req.aiRecommendedSlot = params.suggestedSlot;
      } else {
        req.status = 'pending_approval';
      }
      req.facultyNote = params.reason;
      req.updatedAt = ts;

      ds.approvals.unshift({
        id: approvalId,
        requestId: req.id,
        facultyId: params.facultyId,
        decision: params.decision,
        isOverride: params.isOverride,
        reason: params.reason,
        engineSnapshot: params.engineSnapshot,
        status: 'recorded',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });

      const titleMap = {
        rejected: 'Booking Request Rejected',
        suggested_alternative: 'Alternative Resource/Slot Suggested',
        more_info_requested: 'More Information Requested by Faculty',
      };
      const typeMap: Record<typeof params.decision, NotificationItem['type']> = {
        rejected: 'request_rejected',
        suggested_alternative: 'alternative_suggested',
        more_info_requested: 'more_info_requested',
      };
      ds.notifications.unshift({
        id: notifId,
        userId: req.studentId,
        type: typeMap[params.decision],
        title: titleMap[params.decision],
        message: params.reason,
        link: '/student/bookings',
        read: false,
        status: 'unread',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      ds.auditLogs.unshift({
        id: auditId,
        actorId: params.facultyId,
        action: `FACULTY_${params.decision.toUpperCase()}`,
        entityType: 'bookingRequest',
        entityId: req.id,
        detail: params.reason,
        status: 'recorded',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }

    await runTransaction(db, async (tx) => {
      const reqRef = doc(db!, 'bookingRequests', params.requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new Error('Request not found.');
      const req = reqSnap.data() as BookingRequest;

      const nextStatus =
        params.decision === 'rejected'
          ? 'rejected'
          : params.decision === 'suggested_alternative'
          ? 'ai_recommended'
          : 'pending_approval';

      tx.update(reqRef, {
        status: nextStatus,
        facultyNote: params.reason,
        ...(params.suggestedSlot ? { aiRecommendedSlot: params.suggestedSlot } : {}),
        updatedAt: ts,
      });
      tx.set(doc(db!, 'approvals', approvalId), {
        id: approvalId,
        requestId: req.id,
        facultyId: params.facultyId,
        decision: params.decision,
        isOverride: params.isOverride,
        reason: params.reason,
        engineSnapshot: params.engineSnapshot,
        status: 'recorded',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      const typeMap: Record<typeof params.decision, NotificationItem['type']> = {
        rejected: 'request_rejected',
        suggested_alternative: 'alternative_suggested',
        more_info_requested: 'more_info_requested',
      };
      tx.set(doc(db!, 'notifications', notifId), {
        id: notifId,
        userId: req.studentId,
        type: typeMap[params.decision],
        title: params.decision === 'rejected' ? 'Request Rejected' : params.decision === 'suggested_alternative' ? 'Alternative Suggested' : 'More Info Requested',
        message: params.reason,
        link: '/student/bookings',
        read: false,
        status: 'unread',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      tx.set(doc(db!, 'auditLogs', auditId), {
        id: auditId,
        actorId: params.facultyId,
        action: `FACULTY_${params.decision.toUpperCase()}`,
        entityType: 'bookingRequest',
        entityId: req.id,
        detail: params.reason,
        status: 'recorded',
        isDemo: req.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
    }).catch((e) => handleFirestoreError(e, OperationType.WRITE, `bookingRequests/${params.requestId}`));
    this.notify();
  }

  // --- Cancel Booking / Request ---
  async cancelBooking(bookingId: string, actorId: string, actorRole: UserRole): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const bk = ds.bookings.find((b) => b.id === bookingId);
      if (!bk) throw new Error('Booking not found.');
      bk.status = 'cancelled';
      bk.updatedAt = ts;
      const req = ds.bookingRequests.find((r) => r.id === bk.requestId);
      if (req) {
        req.status = 'cancelled';
        req.updatedAt = ts;
      }
      for (const day of daysBetween(bk.start, bk.end)) {
        const sched = ds.equipmentDaySchedules.find((s) => s.id === `${bk.equipmentId}_${day}`);
        if (sched) {
          sched.intervals = sched.intervals.filter((iv) => iv.bookingId !== bk.id);
          sched.updatedAt = ts;
        }
      }
      // Notify top-fairness waiting candidate on freed slot
      const waiting = ds.waitlists
        .filter((w) => w.equipmentId === bk.equipmentId && w.status === 'waiting')
        .sort((a, b) => b.fairnessScore - a.fairnessScore);
      if (waiting[0]) {
        waiting[0].status = 'notified';
        waiting[0].updatedAt = ts;
        ds.notifications.unshift({
          id: uid('notif'),
          userId: waiting[0].studentId,
          type: 'waitlist_freed',
          title: 'Waitlisted Slot Freed',
          message: `A slot freed on ${bk.start.slice(0, 16).replace('T', ' ')}–${bk.end.slice(11, 16)}. Submit or re-request now.`,
          link: `/student/equipment/${bk.equipmentId}`,
          read: false,
          status: 'unread',
          isDemo: bk.isDemo,
          createdAt: ts,
          updatedAt: ts,
        });
      }
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId,
        action: 'BOOKING_CANCELLED',
        entityType: 'booking',
        entityId: bk.id,
        detail: `Cancelled booking ${bk.id} and released schedule slot.`,
        status: 'recorded',
        isDemo: bk.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }

    await runTransaction(db, async (tx) => {
      const bkRef = doc(db!, 'bookings', bookingId);
      const bkSnap = await tx.get(bkRef);
      if (!bkSnap.exists()) throw new Error('Booking not found.');
      const bk = bkSnap.data() as Booking;

      const days = daysBetween(bk.start, bk.end);
      const schedRefs = days.map((d) => doc(db!, 'equipmentDaySchedules', `${bk.equipmentId}_${d}`));
      const schedSnaps = actorRole !== 'student' ? await Promise.all(schedRefs.map((r) => tx.get(r))) : [];

      tx.update(bkRef, { status: 'cancelled', updatedAt: ts });
      if (actorRole !== 'student') {
        schedSnaps.forEach((sSnap, idx) => {
          if (sSnap.exists()) {
            const sched = sSnap.data() as EquipmentDaySchedule;
            tx.update(schedRefs[idx], {
              intervals: sched.intervals.filter((iv) => iv.bookingId !== bk.id),
              updatedAt: ts,
            });
          }
        });
      }
      tx.set(doc(db!, 'auditLogs', uid('audit')), {
        id: uid('audit'),
        actorId,
        action: 'BOOKING_CANCELLED',
        entityType: 'booking',
        entityId: bk.id,
        detail: `Cancelled booking ${bk.id}.`,
        status: 'recorded',
        isDemo: bk.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
    }).catch((e) => handleFirestoreError(e, OperationType.WRITE, `bookings/${bookingId}`));
    this.notify();
  }

  async cancelBookingRequest(requestId: string, actorId: string): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.bookingRequests = ds.bookingRequests.map((r) =>
        r.id === requestId ? { ...r, status: 'cancelled', updatedAt: ts } : r
      );
      saveLocalDataset(ds);
      this.notify();
      return;
    }
    await updateDoc(doc(db, 'bookingRequests', requestId), { status: 'cancelled', updatedAt: ts }).catch((e) =>
      handleFirestoreError(e, OperationType.UPDATE, `bookingRequests/${requestId}`)
    );
    await setDoc(doc(db, 'auditLogs', uid('audit')), {
      id: uid('audit'),
      actorId,
      action: 'REQUEST_CANCELLED',
      entityType: 'bookingRequest',
      entityId: requestId,
      detail: 'Requester cancelled pending request.',
      status: 'recorded',
      isDemo: false,
      createdAt: ts,
      updatedAt: ts,
    }).catch((e) => handleFirestoreError(e, OperationType.CREATE, 'auditLogs'));
    this.notify();
  }

  // --- Waitlist ---
  async joinWaitlist(params: {
    requestId: string;
    studentId: string;
    equipmentId: string;
    desiredStart: string;
    desiredEnd: string;
    isDemo: boolean;
  }): Promise<WaitlistEntry> {
    const ts = nowIso();
    let usageLogs: UsageLog[] = [];
    let limit = DEFAULT_FAIR_USE_LIMIT_HOURS;

    if (this.mode === 'local-demo' || !db) {
      const localDs = loadLocalDataset();
      usageLogs = localDs.usageLogs;
      limit = localDs.settings.find((s) => s.id === 'allocation')?.fairUseLimitHours ?? DEFAULT_FAIR_USE_LIMIT_HOURS;
    } else {
      const [ulogSnap, allocSnap] = await Promise.all([
        getDocs(query(collection(db, 'usageLogs'), where('studentId', '==', params.studentId))),
        getDoc(doc(db, 'settings', 'allocation')),
      ]);
      usageLogs = ulogSnap.docs.map((d) => d.data() as UsageLog);
      if (allocSnap.exists()) {
        limit = (allocSnap.data() as SettingsDoc).fairUseLimitHours ?? DEFAULT_FAIR_USE_LIMIT_HOURS;
      }
    }

    const usedHours = computeUsedHoursInWindow(params.studentId, usageLogs, ts, 30);
    const fairness = computeFairnessScore(usedHours, limit);

    const entry: WaitlistEntry = {
      id: uid('wl'),
      requestId: params.requestId,
      studentId: params.studentId,
      equipmentId: params.equipmentId,
      desiredStart: params.desiredStart,
      desiredEnd: params.desiredEnd,
      fairnessScore: fairness.score,
      status: 'waiting',
      isDemo: params.isDemo,
      createdAt: ts,
      updatedAt: ts,
    };

    if (this.mode === 'local-demo' || !db) {
      const localDs = loadLocalDataset();
      localDs.waitlists.unshift(entry);
      localDs.bookingRequests = localDs.bookingRequests.map((r) =>
        r.id === params.requestId ? { ...r, status: 'waitlisted', updatedAt: ts } : r
      );
      saveLocalDataset(localDs);
      this.notify();
      return entry;
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'waitlists', entry.id), entry);
    batch.update(doc(db, 'bookingRequests', params.requestId), { status: 'waitlisted', updatedAt: ts });
    await batch.commit().catch((e) => handleFirestoreError(e, OperationType.WRITE, `waitlists/${entry.id}`));
    this.notify();
    return entry;
  }

  // --- QR Check-in & Check-out ---
  async checkInByQr(qrToken: string, staffId: string, nowTimeIso = nowIso()): Promise<Booking> {
    const verifyWindow = (bk: Booking) => {
      const startMs = parseIsoMs(bk.start) - 30 * 60000; // 30m grace before start
      const endMs = parseIsoMs(bk.end);
      const nowMs = parseIsoMs(nowTimeIso);
      if (bk.status !== 'approved') throw new Error(`Booking cannot check in (current status: ${bk.status}).`);
      if (nowMs < startMs || nowMs > endMs) {
        // Allow demo check-in if booking isDemo and matches DEMO_NOW window, else enforce real window
        if (!bk.isDemo) {
          throw new Error('QR code is outside the scheduled booking check-in window.');
        }
      }
    };

    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const bk = ds.bookings.find((b) => b.qrToken === qrToken || b.id === qrToken);
      if (!bk) throw new Error('Invalid QR token: no matching confirmed booking.');
      verifyWindow(bk);
      bk.status = 'checked_in';
      bk.checkedInAt = nowTimeIso;
      bk.updatedAt = nowTimeIso;
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId: staffId,
        action: 'BOOKING_CHECKED_IN',
        entityType: 'booking',
        entityId: bk.id,
        detail: `Verified QR ${qrToken} for ${bk.equipmentId}.`,
        status: 'recorded',
        isDemo: bk.isDemo,
        createdAt: nowTimeIso,
        updatedAt: nowTimeIso,
      });
      saveLocalDataset(ds);
      this.notify();
      return bk;
    }

    const snap = await getDocs(query(collection(db, 'bookings'), where('qrToken', '==', qrToken))).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, 'bookings')
    );
    if (snap.empty) throw new Error('Invalid QR token: no matching confirmed booking.');
    const bk = snap.docs[0].data() as Booking;
    verifyWindow(bk);
    await updateDoc(doc(db, 'bookings', bk.id), {
      status: 'checked_in',
      checkedInAt: nowTimeIso,
      updatedAt: nowTimeIso,
    }).catch((e) => handleFirestoreError(e, OperationType.UPDATE, `bookings/${bk.id}`));
    this.notify();
    return { ...bk, status: 'checked_in', checkedInAt: nowTimeIso };
  }

  async checkOutBooking(bookingId: string, staffId: string, nowTimeIso = nowIso()): Promise<void> {
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const bk = ds.bookings.find((b) => b.id === bookingId);
      if (!bk) throw new Error('Booking not found.');
      const hours = round2(Math.max(0.5, (parseIsoMs(bk.end) - parseIsoMs(bk.start)) / 3600000));
      bk.status = 'completed';
      bk.checkedOutAt = nowTimeIso;
      bk.updatedAt = nowTimeIso;
      ds.bookingRequests = ds.bookingRequests.map((r) =>
        r.id === bk.requestId ? { ...r, status: 'completed', updatedAt: nowTimeIso } : r
      );
      ds.usageLogs.unshift({
        id: uid('ulog'),
        studentId: bk.studentId,
        equipmentId: bk.equipmentId,
        bookingId: bk.id,
        hours,
        loggedAt: nowTimeIso,
        status: 'logged',
        isDemo: bk.isDemo,
        createdAt: nowTimeIso,
        updatedAt: nowTimeIso,
      });
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId: staffId,
        action: 'BOOKING_CHECKED_OUT',
        entityType: 'booking',
        entityId: bk.id,
        detail: `Checked out and logged ${hours}h usage.`,
        status: 'recorded',
        isDemo: bk.isDemo,
        createdAt: nowTimeIso,
        updatedAt: nowTimeIso,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }

    await runTransaction(db, async (tx) => {
      const bkRef = doc(db!, 'bookings', bookingId);
      const bkSnap = await tx.get(bkRef);
      if (!bkSnap.exists()) throw new Error('Booking not found.');
      const bk = bkSnap.data() as Booking;
      const hours = round2(Math.max(0.5, (parseIsoMs(bk.end) - parseIsoMs(bk.start)) / 3600000));
      tx.update(bkRef, { status: 'completed', checkedOutAt: nowTimeIso, updatedAt: nowTimeIso });
      if (bk.requestId) {
        const reqRef = doc(db!, 'bookingRequests', bk.requestId);
        const reqSnap = await tx.get(reqRef);
        if (reqSnap.exists()) {
          tx.update(reqRef, { status: 'completed', updatedAt: nowTimeIso });
        }
      }
      const ulogId = uid('ulog');
      tx.set(doc(db!, 'usageLogs', ulogId), {
        id: ulogId,
        studentId: bk.studentId,
        equipmentId: bk.equipmentId,
        bookingId: bk.id,
        hours,
        loggedAt: nowTimeIso,
        status: 'logged',
        isDemo: bk.isDemo,
        createdAt: nowTimeIso,
        updatedAt: nowTimeIso,
      });
      const auditId = uid('audit');
      tx.set(doc(db!, 'auditLogs', auditId), {
        id: auditId,
        actorId: staffId,
        action: 'BOOKING_CHECKED_OUT',
        entityType: 'booking',
        entityId: bk.id,
        detail: `Checked out and logged ${hours}h usage.`,
        status: 'recorded',
        isDemo: bk.isDemo,
        createdAt: nowTimeIso,
        updatedAt: nowTimeIso,
      });
    }).catch((e) => handleFirestoreError(e, OperationType.WRITE, `bookings/${bookingId}`));
    this.notify();
  }

  // --- Persist Engine Allocation Result ---
  async saveAllocationResult(result: AllocationResult, actorId: string): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.allocationResults = [result, ...ds.allocationResults.filter((a) => a.id !== result.id)];
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId,
        action: 'ALLOCATION_COMPUTED',
        entityType: 'allocationResult',
        entityId: result.id,
        detail: `Ran deterministic engine v${result.engineVersion} for ${result.equipmentId} on ${result.date} (${result.entries.length} requests).`,
        status: 'recorded',
        isDemo: result.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }

    await setDoc(doc(db, 'allocationResults', result.id), result).catch((e) =>
      handleFirestoreError(e, OperationType.WRITE, `allocationResults/${result.id}`)
    );
    await setDoc(doc(db, 'auditLogs', uid('audit')), {
      id: uid('audit'),
      actorId,
      action: 'ALLOCATION_COMPUTED',
      entityType: 'allocationResult',
      entityId: result.id,
      detail: `Ran deterministic engine v${result.engineVersion} for ${result.equipmentId} on ${result.date}.`,
      status: 'recorded',
      isDemo: result.isDemo,
      createdAt: ts,
      updatedAt: ts,
    }).catch((e) => handleFirestoreError(e, OperationType.CREATE, 'auditLogs'));
    this.notify();
  }

  // --- Admin CRUD: Equipment, Labs, Departments, Maintenance, Settings ---
  async upsertEquipment(eq: Omit<Equipment, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }, actorId: string): Promise<Equipment> {
    const ts = nowIso();
    const id = eq.id || uid('eq');
    const full: Equipment = {
      ...eq,
      id,
      status: eq.maintenanceStatus === 'under_maintenance' ? 'maintenance' : eq.isActive ? 'active' : 'inactive',
      createdAt: ts,
      updatedAt: ts,
    };

    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const idx = ds.equipment.findIndex((e) => e.id === id);
      if (idx >= 0) {
        full.createdAt = ds.equipment[idx].createdAt;
        ds.equipment[idx] = full;
      } else {
        ds.equipment.unshift(full);
      }
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId,
        action: idx >= 0 ? 'EQUIPMENT_UPDATED' : 'EQUIPMENT_CREATED',
        entityType: 'equipment',
        entityId: id,
        detail: `${idx >= 0 ? 'Updated' : 'Created'} ${full.equipmentId} (${full.name}).`,
        status: 'recorded',
        isDemo: full.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return full;
    }

    const existing = await getDoc(doc(db, 'equipment', id));
    if (existing.exists()) full.createdAt = (existing.data() as Equipment).createdAt;
    await setDoc(doc(db, 'equipment', id), full).catch((e) =>
      handleFirestoreError(e, OperationType.WRITE, `equipment/${id}`)
    );
    this.notify();
    return full;
  }

  async toggleEquipmentActive(equipmentDocId: string, isActive: boolean, actorId: string): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.equipment = ds.equipment.map((e) =>
        e.id === equipmentDocId ? { ...e, isActive, status: isActive ? 'active' : 'inactive', updatedAt: ts } : e
      );
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId,
        action: isActive ? 'EQUIPMENT_ACTIVATED' : 'EQUIPMENT_DEACTIVATED',
        entityType: 'equipment',
        entityId: equipmentDocId,
        detail: `Set active=${isActive}.`,
        status: 'recorded',
        isDemo: false,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }
    await updateDoc(doc(db, 'equipment', equipmentDocId), {
      isActive,
      status: isActive ? 'active' : 'inactive',
      updatedAt: ts,
    }).catch((e) => handleFirestoreError(e, OperationType.UPDATE, `equipment/${equipmentDocId}`));
    this.notify();
  }

  async upsertDepartment(dept: Omit<Department, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Department> {
    const ts = nowIso();
    const id = dept.id || uid('dept');
    const full: Department = { ...dept, id, status: 'active', createdAt: ts, updatedAt: ts };
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const idx = ds.departments.findIndex((d) => d.id === id);
      if (idx >= 0) ds.departments[idx] = { ...ds.departments[idx], ...full, createdAt: ds.departments[idx].createdAt };
      else ds.departments.push(full);
      saveLocalDataset(ds);
      this.notify();
      return full;
    }
    await setDoc(doc(db, 'departments', id), full).catch((e) =>
      handleFirestoreError(e, OperationType.WRITE, `departments/${id}`)
    );
    this.notify();
    return full;
  }

  async upsertLaboratory(lab: Omit<Laboratory, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Laboratory> {
    const ts = nowIso();
    const id = lab.id || uid('lab');
    const full: Laboratory = { ...lab, id, status: 'active', createdAt: ts, updatedAt: ts };
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const idx = ds.laboratories.findIndex((l) => l.id === id);
      if (idx >= 0) ds.laboratories[idx] = { ...ds.laboratories[idx], ...full, createdAt: ds.laboratories[idx].createdAt };
      else ds.laboratories.push(full);
      saveLocalDataset(ds);
      this.notify();
      return full;
    }
    await setDoc(doc(db, 'laboratories', id), full).catch((e) =>
      handleFirestoreError(e, OperationType.WRITE, `laboratories/${id}`)
    );
    this.notify();
    return full;
  }

  async scheduleMaintenance(
    input: Omit<MaintenanceRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
    actorId: string
  ): Promise<{ record: MaintenanceRecord; flaggedBookingsCount: number }> {
    const ts = nowIso();
    const record: MaintenanceRecord = {
      ...input,
      id: uid('maint'),
      status: 'scheduled',
      createdAt: ts,
      updatedAt: ts,
    };

    const mStart = parseIsoMs(record.start);
    const mEnd = parseIsoMs(record.end);
    let flaggedCount = 0;

    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.maintenance.unshift(record);
      for (const bk of ds.bookings) {
        if (
          bk.equipmentId === record.equipmentId &&
          (bk.status === 'approved' || bk.status === 'checked_in') &&
          intervalsOverlap(mStart, mEnd, parseIsoMs(bk.start), parseIsoMs(bk.end))
        ) {
          bk.maintenanceConflict = true;
          bk.updatedAt = ts;
          flaggedCount += 1;
          ds.notifications.unshift({
            id: uid('notif'),
            userId: bk.studentId,
            type: 'maintenance_alert',
            title: 'Maintenance Impacts Confirmed Booking',
            message: `Scheduled maintenance "${record.title}" overlaps your booking (${bk.start.slice(0, 16).replace('T', ' ')}).`,
            link: '/student/bookings',
            read: false,
            status: 'unread',
            isDemo: bk.isDemo,
            createdAt: ts,
            updatedAt: ts,
          });
        }
      }
      ds.equipment = ds.equipment.map((e) =>
        e.id === record.equipmentId && e.maintenanceStatus === 'operational'
          ? { ...e, maintenanceStatus: 'scheduled', updatedAt: ts }
          : e
      );
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId,
        action: 'MAINTENANCE_SCHEDULED',
        entityType: 'maintenance',
        entityId: record.id,
        detail: `Scheduled "${record.title}" (${flaggedCount} overlapping booking(s) flagged).`,
        status: 'recorded',
        isDemo: record.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return { record, flaggedBookingsCount: flaggedCount };
    }

    await setDoc(doc(db, 'maintenance', record.id), record).catch((e) =>
      handleFirestoreError(e, OperationType.CREATE, `maintenance/${record.id}`)
    );
    const [bkSnap, eqSnap] = await Promise.all([
      getDocs(query(collection(db, 'bookings'), where('equipmentId', '==', record.equipmentId))),
      getDoc(doc(db, 'equipment', record.equipmentId)),
    ]);
    const batch = writeBatch(db);
    for (const d of bkSnap.docs) {
      const bk = d.data() as Booking;
      if ((bk.status === 'approved' || bk.status === 'checked_in') && intervalsOverlap(mStart, mEnd, parseIsoMs(bk.start), parseIsoMs(bk.end))) {
        flaggedCount += 1;
        batch.update(doc(db, 'bookings', bk.id), { maintenanceConflict: true, updatedAt: ts });
        const nid = uid('notif');
        batch.set(doc(db, 'notifications', nid), {
          id: nid,
          userId: bk.studentId,
          type: 'maintenance_alert',
          title: 'Maintenance Impacts Confirmed Booking',
          message: `Scheduled maintenance "${record.title}" overlaps your booking.`,
          link: '/student/bookings',
          read: false,
          status: 'unread',
          isDemo: bk.isDemo,
          createdAt: ts,
          updatedAt: ts,
        });
      }
    }
    if (eqSnap.exists() && (eqSnap.data() as Equipment).maintenanceStatus === 'operational') {
      batch.update(doc(db, 'equipment', record.equipmentId), { maintenanceStatus: 'scheduled', updatedAt: ts });
    }
    const auditId = uid('audit');
    batch.set(doc(db, 'auditLogs', auditId), {
      id: auditId,
      actorId,
      action: 'MAINTENANCE_SCHEDULED',
      entityType: 'maintenance',
      entityId: record.id,
      detail: `Scheduled "${record.title}" (${flaggedCount} overlapping booking(s) flagged).`,
      status: 'recorded',
      isDemo: record.isDemo,
      createdAt: ts,
      updatedAt: ts,
    });
    await batch.commit().catch((e) => handleFirestoreError(e, OperationType.WRITE, 'maintenance-flags'));
    this.notify();
    return { record, flaggedBookingsCount: flaggedCount };
  }

  async completeMaintenance(maintenanceId: string, actorId: string): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const rec = ds.maintenance.find((m) => m.id === maintenanceId);
      if (!rec) return;
      rec.status = 'completed';
      rec.updatedAt = ts;
      const stillOpen = ds.maintenance.some(
        (m) => m.id !== maintenanceId && m.equipmentId === rec.equipmentId && (m.status === 'scheduled' || m.status === 'in_progress')
      );
      ds.equipment = ds.equipment.map((e) =>
        e.id === rec.equipmentId
          ? {
              ...e,
              maintenanceStatus: stillOpen ? 'scheduled' : 'operational',
              status: e.isActive ? 'active' : 'inactive',
              updatedAt: ts,
            }
          : e
      );
      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId,
        action: 'MAINTENANCE_COMPLETED',
        entityType: 'maintenance',
        entityId: maintenanceId,
        detail: `Marked maintenance "${rec.title}" completed.`,
        status: 'recorded',
        isDemo: rec.isDemo,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }

    const mSnap = await getDoc(doc(db, 'maintenance', maintenanceId));
    if (!mSnap.exists()) return;
    const rec = mSnap.data() as MaintenanceRecord;
    const [otherMaintSnap, eqSnap] = await Promise.all([
      getDocs(query(collection(db, 'maintenance'), where('equipmentId', '==', rec.equipmentId))),
      getDoc(doc(db, 'equipment', rec.equipmentId)),
    ]);
    const stillOpen = otherMaintSnap.docs.some((d) => {
      const m = d.data() as MaintenanceRecord;
      return m.id !== maintenanceId && (m.status === 'scheduled' || m.status === 'in_progress');
    });
    const eqActive = eqSnap.exists() ? (eqSnap.data() as Equipment).isActive : true;

    const batch = writeBatch(db);
    batch.update(doc(db, 'maintenance', maintenanceId), { status: 'completed', updatedAt: ts });
    batch.update(doc(db, 'equipment', rec.equipmentId), {
      maintenanceStatus: stillOpen ? 'scheduled' : 'operational',
      status: eqActive ? 'active' : 'inactive',
      updatedAt: ts,
    });
    const auditId = uid('audit');
    batch.set(doc(db, 'auditLogs', auditId), {
      id: auditId,
      actorId,
      action: 'MAINTENANCE_COMPLETED',
      entityType: 'maintenance',
      entityId: maintenanceId,
      detail: `Marked maintenance "${rec.title}" completed.`,
      status: 'recorded',
      isDemo: rec.isDemo,
      createdAt: ts,
      updatedAt: ts,
    });
    await batch.commit().catch((e) => handleFirestoreError(e, OperationType.WRITE, `maintenance/${maintenanceId}`));
    this.notify();
  }

  async saveAllocationSettings(params: {
    weights: AllocationWeights;
    fairUseLimitHours: number;
    enforceFairUseHard: boolean;
    demoEnabled: boolean;
    actorId: string;
  }): Promise<void> {
    const ts = nowIso();
    const normalized = normalizeWeights(params.weights);
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      const allocIdx = ds.settings.findIndex((s) => s.id === 'allocation');
      const allocDoc: SettingsDoc = {
        id: 'allocation',
        weights: normalized,
        fairUseLimitHours: params.fairUseLimitHours,
        enforceFairUseHard: params.enforceFairUseHard,
        status: 'active',
        isDemo: false,
        createdAt: allocIdx >= 0 ? ds.settings[allocIdx].createdAt : ts,
        updatedAt: ts,
      };
      if (allocIdx >= 0) ds.settings[allocIdx] = allocDoc;
      else ds.settings.push(allocDoc);

      const demoIdx = ds.settings.findIndex((s) => s.id === 'demo');
      const demoDoc: SettingsDoc = {
        id: 'demo',
        enabled: params.demoEnabled,
        status: 'active',
        isDemo: true,
        createdAt: demoIdx >= 0 ? ds.settings[demoIdx].createdAt : ts,
        updatedAt: ts,
      };
      if (demoIdx >= 0) ds.settings[demoIdx] = demoDoc;
      else ds.settings.push(demoDoc);

      ds.auditLogs.unshift({
        id: uid('audit'),
        actorId: params.actorId,
        action: 'SETTINGS_UPDATED',
        entityType: 'settings',
        entityId: 'allocation',
        detail: `Updated weights (${JSON.stringify(normalized)}), fairUse=${params.fairUseLimitHours}h, demoEnabled=${params.demoEnabled}.`,
        status: 'recorded',
        isDemo: false,
        createdAt: ts,
        updatedAt: ts,
      });
      saveLocalDataset(ds);
      this.notify();
      return;
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'settings', 'allocation'), {
      id: 'allocation',
      weights: normalized,
      fairUseLimitHours: params.fairUseLimitHours,
      enforceFairUseHard: params.enforceFairUseHard,
      status: 'active',
      isDemo: false,
      createdAt: ts,
      updatedAt: ts,
    });
    batch.set(doc(db, 'settings', 'demo'), {
      id: 'demo',
      enabled: params.demoEnabled,
      status: 'active',
      isDemo: true,
      createdAt: ts,
      updatedAt: ts,
    });
    batch.set(doc(db, 'auditLogs', uid('audit')), {
      id: uid('audit'),
      actorId: params.actorId,
      action: 'SETTINGS_UPDATED',
      entityType: 'settings',
      entityId: 'allocation',
      detail: `Updated weights & demo settings.`,
      status: 'recorded',
      isDemo: false,
      createdAt: ts,
      updatedAt: ts,
    });
    await batch.commit().catch((e) => handleFirestoreError(e, OperationType.WRITE, 'settings'));
    this.notify();
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.notifications = ds.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true, status: 'read', updatedAt: ts } : n
      );
      saveLocalDataset(ds);
      this.notify();
      return;
    }
    await updateDoc(doc(db, 'notifications', notificationId), { read: true, status: 'read', updatedAt: ts }).catch((e) =>
      handleFirestoreError(e, OperationType.UPDATE, `notifications/${notificationId}`)
    );
    this.notify();
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    const ts = nowIso();
    if (this.mode === 'local-demo' || !db) {
      const ds = loadLocalDataset();
      ds.notifications = ds.notifications.map((n) =>
        n.userId === userId ? { ...n, read: true, status: 'read', updatedAt: ts } : n
      );
      saveLocalDataset(ds);
      this.notify();
      return;
    }
    const snap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', false)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true, status: 'read', updatedAt: ts }));
    await batch.commit().catch((e) => handleFirestoreError(e, OperationType.UPDATE, 'notifications'));
    this.notify();
  }

  async ensureUpcomingReminders(userId: string, nowTimeIso = nowIso()): Promise<void> {
    let bookings: Booking[] = [];
    let notifications: NotificationItem[] = [];

    if (this.mode === 'local-demo' || !db) {
      const localDs = loadLocalDataset();
      bookings = localDs.bookings.filter((b) => b.studentId === userId);
      notifications = localDs.notifications.filter((n) => n.userId === userId);
    } else {
      const [bkSnap, notifSnap] = await Promise.all([
        getDocs(query(collection(db, 'bookings'), where('studentId', '==', userId))),
        getDocs(query(collection(db, 'notifications'), where('userId', '==', userId))),
      ]);
      bookings = bkSnap.docs.map((d) => d.data() as Booking);
      notifications = notifSnap.docs.map((d) => d.data() as NotificationItem);
    }

    const nowMs = parseIsoMs(nowTimeIso);
    const in24hMs = nowMs + 24 * 3600000;
    const upcoming = bookings.filter(
      (b) =>
        b.studentId === userId &&
        b.status === 'approved' &&
        parseIsoMs(b.start) >= nowMs &&
        parseIsoMs(b.start) <= in24hMs
    );
    if (upcoming.length === 0) return;

    const existingMsgs = new Set(notifications.filter((n) => n.userId === userId && n.type === 'booking_reminder').map((n) => n.message));
    const toAdd: NotificationItem[] = [];
    for (const bk of upcoming) {
      const msg = `Reminder: Confirmed session on ${bk.start.slice(0, 16).replace('T', ' ')}–${bk.end.slice(11, 16)}.`;
      if (!existingMsgs.has(msg)) {
        toAdd.push({
          id: uid('notif'),
          userId,
          type: 'booking_reminder',
          title: 'Upcoming Lab Booking (<24h)',
          message: msg,
          link: '/student/bookings',
          read: false,
          status: 'unread',
          isDemo: bk.isDemo,
          createdAt: nowTimeIso,
          updatedAt: nowTimeIso,
        });
      }
    }
    if (toAdd.length === 0) return;

    if (this.mode === 'local-demo' || !db) {
      const localDs = loadLocalDataset();
      localDs.notifications.unshift(...toAdd);
      saveLocalDataset(localDs);
      this.notify();
      return;
    }
    const batch = writeBatch(db);
    toAdd.forEach((n) => batch.set(doc(db!, 'notifications', n.id), n));
    await batch.commit().catch(() => {});
    this.notify();
  }
}

export const repo = new LabLinkRepository();
export { DEFAULT_WEIGHTS, DEFAULT_FAIR_USE_LIMIT_HOURS };
