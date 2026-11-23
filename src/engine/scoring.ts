import type {
  AllocationWeights,
  BookingRequest,
  Equipment,
  Laboratory,
  MaintenanceRecord,
  Project,
  ScoreBreakdown,
  UsageLog,
} from '../types/models';
import {
  COMPATIBLE_CATEGORIES,
  DEADLINE_ANCHORS,
  DEFAULT_FAIR_USE_LIMIT_HOURS,
  DEFAULT_WEIGHTS,
  makeDayTimeMs,
  parseIsoMs,
  round1,
  round2,
  toDateKey,
} from './constants';
import {
  checkSpecsMatch,
  getConcurrentUnits,
  Interval,
  intervalsOverlap,
  isWithinLabHours,
} from './constraints';

export function normalizeWeights(raw?: Partial<AllocationWeights>): AllocationWeights {
  const candidate: AllocationWeights = {
    deadline: typeof raw?.deadline === 'number' && Number.isFinite(raw.deadline) ? Math.max(0, Math.min(1, raw.deadline)) : DEFAULT_WEIGHTS.deadline,
    necessity: typeof raw?.necessity === 'number' && Number.isFinite(raw.necessity) ? Math.max(0, Math.min(1, raw.necessity)) : DEFAULT_WEIGHTS.necessity,
    fairness: typeof raw?.fairness === 'number' && Number.isFinite(raw.fairness) ? Math.max(0, Math.min(1, raw.fairness)) : DEFAULT_WEIGHTS.fairness,
    feasibility: typeof raw?.feasibility === 'number' && Number.isFinite(raw.feasibility) ? Math.max(0, Math.min(1, raw.feasibility)) : DEFAULT_WEIGHTS.feasibility,
    waiting: typeof raw?.waiting === 'number' && Number.isFinite(raw.waiting) ? Math.max(0, Math.min(1, raw.waiting)) : DEFAULT_WEIGHTS.waiting,
  };

  const sum = candidate.deadline + candidate.necessity + candidate.fairness + candidate.feasibility + candidate.waiting;
  if (sum <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  return {
    deadline: candidate.deadline / sum,
    necessity: candidate.necessity / sum,
    fairness: candidate.fairness / sum,
    feasibility: candidate.feasibility / sum,
    waiting: candidate.waiting / sum,
  };
}

export function computeDeadlineScore(deadlineIso: string, nowIso: string): {
  hoursToDeadline: number;
  score: number;
  isPastDeadline: boolean;
} {
  const deadlineMs = parseIsoMs(deadlineIso);
  const nowMs = parseIsoMs(nowIso);
  const hoursToDeadline = (deadlineMs - nowMs) / 3600000;

  if (hoursToDeadline <= 0) {
    return { hoursToDeadline, score: 100, isPastDeadline: true };
  }

  if (hoursToDeadline <= DEADLINE_ANCHORS[1][0]) {
    return { hoursToDeadline, score: 100, isPastDeadline: false };
  }

  const lastAnchor = DEADLINE_ANCHORS[DEADLINE_ANCHORS.length - 1];
  if (hoursToDeadline >= lastAnchor[0]) {
    return { hoursToDeadline, score: lastAnchor[1], isPastDeadline: false };
  }

  for (let i = 0; i < DEADLINE_ANCHORS.length - 1; i++) {
    const [h1, s1] = DEADLINE_ANCHORS[i];
    const [h2, s2] = DEADLINE_ANCHORS[i + 1];
    if (hoursToDeadline >= h1 && hoursToDeadline <= h2) {
      const t = (hoursToDeadline - h1) / (h2 - h1);
      const score = s1 + t * (s2 - s1);
      return { hoursToDeadline, score: round2(score), isPastDeadline: false };
    }
  }

  return { hoursToDeadline, score: 5, isPastDeadline: false };
}

export function computeUsedHoursInWindow(
  studentId: string,
  usageLogs: UsageLog[],
  nowIso: string,
  windowDays = 30
): number {
  const nowMs = parseIsoMs(nowIso);
  const cutoffMs = nowMs - windowDays * 24 * 3600000;
  let total = 0;
  for (const log of usageLogs) {
    if (log.studentId !== studentId) continue;
    const logMs = parseIsoMs(log.loggedAt);
    if (logMs >= cutoffMs && logMs <= nowMs) {
      total += log.hours;
    }
  }
  return round2(total);
}

export function computeFairnessScore(
  usedHours: number,
  fairUseLimitHours = DEFAULT_FAIR_USE_LIMIT_HOURS
): { score: number; exceeded: boolean } {
  const limit = fairUseLimitHours > 0 ? fairUseLimitHours : DEFAULT_FAIR_USE_LIMIT_HOURS;
  const ratio = Math.min(1, Math.max(0, usedHours / limit));
  const score = round2(100 * (1 - ratio));
  return { score, exceeded: usedHours > limit };
}

export function isSlotFreeOnEquipment(
  startMs: number,
  endMs: number,
  units: number,
  equipment: Equipment,
  lab: Laboratory | undefined,
  intervals: Interval[],
  maintenanceRecords: MaintenanceRecord[]
): boolean {
  if (!equipment.isActive || equipment.status === 'inactive' || equipment.maintenanceStatus === 'under_maintenance') {
    return false;
  }
  if (units > equipment.quantity) return false;
  const durationMins = (endMs - startMs) / 60000;
  if (durationMins < equipment.minBookingMins || durationMins > equipment.maxBookingMins) {
    return false;
  }
  if (!isWithinLabHours(startMs, endMs, lab).passed) {
    return false;
  }
  const maintConflict = maintenanceRecords.some(
    (m) =>
      m.equipmentId === equipment.id &&
      (m.status === 'scheduled' || m.status === 'in_progress') &&
      intervalsOverlap(startMs, endMs, parseIsoMs(m.start), parseIsoMs(m.end))
  );
  if (maintConflict) return false;

  const peakOccupied = getConcurrentUnits(startMs, endMs, intervals);
  return peakOccupied + units <= equipment.quantity;
}

export function computeNecessityScore(
  request: BookingRequest,
  primaryEquipment: Equipment,
  allEquipment: Equipment[],
  labsById: Map<string, Laboratory>,
  confirmedIntervalsByEq: Map<string, Interval[]>,
  maintenanceRecords: MaintenanceRecord[]
): { alternativeCount: number; qualifyingAlternativeIds: string[]; score: number } {
  const compatCats = COMPATIBLE_CATEGORIES[primaryEquipment.category] ?? [primaryEquipment.category];
  const startMs = parseIsoMs(request.requestedStart);
  const endMs = parseIsoMs(request.requestedEnd);

  const qualifyingIds: string[] = [];

  for (const eq of allEquipment) {
    if (eq.id === primaryEquipment.id) continue;
    if (!compatCats.includes(eq.category)) continue;
    if (!checkSpecsMatch(request.requiredSpecs, eq.specs).passed) continue;

    const lab = labsById.get(eq.laboratoryId);
    const intervals = confirmedIntervalsByEq.get(eq.id) ?? [];
    if (isSlotFreeOnEquipment(startMs, endMs, request.units, eq, lab, intervals, maintenanceRecords)) {
      qualifyingIds.push(eq.id);
    }
  }

  const n = qualifyingIds.length;
  const score = 100 - 20 * Math.min(n, 4);
  return { alternativeCount: n, qualifyingAlternativeIds: qualifyingIds, score };
}

export function findEarliestFeasibleSlot(
  durationMs: number,
  units: number,
  equipment: Equipment,
  lab: Laboratory | undefined,
  intervals: Interval[],
  maintenanceRecords: MaintenanceRecord[],
  searchStartMs: number,
  deadlineCutoffMs: number | null,
  maxDaysToSearch = 14
): { startMs: number; endMs: number } | null {
  const stepMs = 30 * 60000;
  const openHour = lab?.openHour ?? '09:00';
  const closeHour = lab?.closeHour ?? '18:00';

  const startDate = new Date(searchStartMs);
  for (let dayOffset = 0; dayOffset < maxDaysToSearch; dayOffset++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset);
    const dayKey = toDateKey(d.getTime());
    const dayOpenMs = makeDayTimeMs(dayKey, openHour);
    const dayCloseMs = makeDayTimeMs(dayKey, closeHour);

    const effectiveStart = dayOffset === 0 ? Math.max(dayOpenMs, Math.ceil(searchStartMs / stepMs) * stepMs) : dayOpenMs;

    for (let cursor = effectiveStart; cursor + durationMs <= dayCloseMs; cursor += stepMs) {
      const endCursor = cursor + durationMs;
      if (deadlineCutoffMs !== null && endCursor > deadlineCutoffMs) {
        return null;
      }
      if (isSlotFreeOnEquipment(cursor, endCursor, units, equipment, lab, intervals, maintenanceRecords)) {
        return { startMs: cursor, endMs: endCursor };
      }
    }
  }
  return null;
}

export function computeFeasibilityScore(
  request: BookingRequest,
  equipment: Equipment,
  lab: Laboratory | undefined,
  confirmedIntervals: Interval[],
  maintenanceRecords: MaintenanceRecord[],
  deadlineCutoffMs: number | null,
  nowMs: number
): { score: number; detail: string } {
  const startMs = parseIsoMs(request.requestedStart);
  const endMs = parseIsoMs(request.requestedEnd);
  const durationMs = endMs - startMs;

  if (isSlotFreeOnEquipment(startMs, endMs, request.units, equipment, lab, confirmedIntervals, maintenanceRecords)) {
    return { score: 100, detail: 'Requested slot is free against confirmed schedule.' };
  }

  const searchStart = Math.max(nowMs, startMs - 24 * 3600000);
  const earliest = findEarliestFeasibleSlot(
    durationMs,
    request.units,
    equipment,
    lab,
    confirmedIntervals,
    maintenanceRecords,
    searchStart,
    deadlineCutoffMs
  );

  if (earliest) {
    if (Math.abs(earliest.startMs - startMs) <= 24 * 3600000) {
      return { score: 80, detail: 'Feasible alternative slot exists within 24h.' };
    }
    return { score: 60, detail: 'Feasible alternative slot exists before deadline (>24h shift).' };
  }

  if (equipment.allowsSplitBooking) {
    // Check if at least two 30-min blocks sum to durationMs
    const totalFreeMins = findSplitCapacityMinutes(
      equipment,
      lab,
      confirmedIntervals,
      maintenanceRecords,
      Math.max(nowMs, startMs),
      deadlineCutoffMs
    );
    if (totalFreeMins >= durationMs / 60000) {
      return { score: 40, detail: 'Only split-booking segments can satisfy requested duration before deadline.' };
    }
  }

  return { score: 0, detail: 'No feasible slot found before project deadline.' };
}

export function findSplitCapacityMinutes(
  equipment: Equipment,
  lab: Laboratory | undefined,
  intervals: Interval[],
  maintenanceRecords: MaintenanceRecord[],
  searchStartMs: number,
  deadlineCutoffMs: number | null
): number {
  const stepMs = 30 * 60000;
  const openHour = lab?.openHour ?? '09:00';
  const closeHour = lab?.closeHour ?? '18:00';
  let freeMins = 0;

  const startDate = new Date(searchStartMs);
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset);
    const dayKey = toDateKey(d.getTime());
    const dayOpenMs = makeDayTimeMs(dayKey, openHour);
    const dayCloseMs = makeDayTimeMs(dayKey, closeHour);
    const effectiveStart = dayOffset === 0 ? Math.max(dayOpenMs, searchStartMs) : dayOpenMs;

    for (let cursor = effectiveStart; cursor + stepMs <= dayCloseMs; cursor += stepMs) {
      if (deadlineCutoffMs !== null && cursor + stepMs > deadlineCutoffMs) break;
      const maintConflict = maintenanceRecords.some(
        (m) =>
          m.equipmentId === equipment.id &&
          (m.status === 'scheduled' || m.status === 'in_progress') &&
          intervalsOverlap(cursor, cursor + stepMs, parseIsoMs(m.start), parseIsoMs(m.end))
      );
      if (maintConflict) continue;
      if (getConcurrentUnits(cursor, cursor + stepMs, intervals) + 1 <= equipment.quantity) {
        freeMins += 30;
      }
    }
  }
  return freeMins;
}

export function computeWaitingScore(submittedAtIso: string, nowIso: string): {
  waitHours: number;
  score: number;
} {
  const waitHours = Math.max(0, (parseIsoMs(nowIso) - parseIsoMs(submittedAtIso)) / 3600000);
  const score = round2(100 * Math.min(1, waitHours / 72));
  return { waitHours: round1(waitHours), score };
}

export function buildScoreBreakdown(params: {
  request: BookingRequest;
  project: Project | undefined;
  equipment: Equipment;
  allEquipment: Equipment[];
  labsById: Map<string, Laboratory>;
  confirmedIntervalsByEq: Map<string, Interval[]>;
  maintenanceRecords: MaintenanceRecord[];
  usageLogs: UsageLog[];
  weights: AllocationWeights;
  fairUseLimitHours: number;
  nowIso: string;
  deadlineCutoffMs: number | null;
}): {
  breakdown: ScoreBreakdown;
  usedHours: number;
  fairUseExceeded: boolean;
  isPastDeadline: boolean;
  qualifyingAlternativeIds: string[];
} {
  const {
    request,
    project,
    equipment,
    allEquipment,
    labsById,
    confirmedIntervalsByEq,
    maintenanceRecords,
    usageLogs,
    weights,
    fairUseLimitHours,
    nowIso,
    deadlineCutoffMs,
  } = params;

  const deadlineRes = computeDeadlineScore(project?.deadline ?? request.requestedEnd, nowIso);
  const necessityRes = computeNecessityScore(
    request,
    equipment,
    allEquipment,
    labsById,
    confirmedIntervalsByEq,
    maintenanceRecords
  );
  const usedHours = computeUsedHoursInWindow(request.studentId, usageLogs, nowIso, 30);
  const fairnessRes = computeFairnessScore(usedHours, fairUseLimitHours);
  const lab = labsById.get(equipment.laboratoryId);
  const confirmedIntervals = confirmedIntervalsByEq.get(equipment.id) ?? [];
  const feasibilityRes = computeFeasibilityScore(
    request,
    equipment,
    lab,
    confirmedIntervals,
    maintenanceRecords,
    deadlineCutoffMs,
    parseIsoMs(nowIso)
  );
  const waitingRes = computeWaitingScore(request.submittedAt, nowIso);

  const wDeadline = deadlineRes.score * weights.deadline;
  const wNecessity = necessityRes.score * weights.necessity;
  const wFairness = fairnessRes.score * weights.fairness;
  const wFeasibility = feasibilityRes.score * weights.feasibility;
  const wWaiting = waitingRes.score * weights.waiting;

  const total = round1(wDeadline + wNecessity + wFairness + wFeasibility + wWaiting);

  return {
    breakdown: {
      deadline: {
        rawInput: `${round1(deadlineRes.hoursToDeadline)}h`,
        score: round1(deadlineRes.score),
        weight: round2(weights.deadline),
        weighted: round2(wDeadline),
      },
      necessity: {
        rawInput: `${necessityRes.alternativeCount} alt(s)`,
        score: round1(necessityRes.score),
        weight: round2(weights.necessity),
        weighted: round2(wNecessity),
      },
      fairness: {
        rawInput: `${usedHours}h / ${fairUseLimitHours}h`,
        score: round1(fairnessRes.score),
        weight: round2(weights.fairness),
        weighted: round2(wFairness),
      },
      feasibility: {
        rawInput: feasibilityRes.detail,
        score: round1(feasibilityRes.score),
        weight: round2(weights.feasibility),
        weighted: round2(wFeasibility),
      },
      waiting: {
        rawInput: `${waitingRes.waitHours}h`,
        score: round1(waitingRes.score),
        weight: round2(weights.waiting),
        weighted: round2(wWaiting),
      },
      total,
    },
    usedHours,
    fairUseExceeded: fairnessRes.exceeded,
    isPastDeadline: deadlineRes.isPastDeadline,
    qualifyingAlternativeIds: necessityRes.qualifyingAlternativeIds,
  };
}
