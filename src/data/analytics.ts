import type { LabLinkDataset } from './seed';
import { parseHourMinute, parseIsoMs, round1, round2 } from '../engine/constants';
import { intervalsOverlap } from '../engine/constraints';

export interface AnalyticsFilter {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  departmentId?: string;
  category?: string;
  laboratoryId?: string;
}

export interface AnalyticsSnapshot {
  utilizationFormula: string;
  overallUtilizationPct: number;
  occupiedHours: number;
  availableOperatingHours: number;
  crossDepartmentPct: number;
  approvalRatePct: number;
  totalRequests: number;
  totalConfirmedBookings: number;
  totalMaintenanceEvents: number;
  byDepartment: Array<{ departmentId: string; name: string; code: string; utilizationPct: number; occupiedHours: number; bookings: number }>;
  mostRequestedEquipment: Array<{ equipmentId: string; code: string; name: string; requests: number; approved: number }>;
  demandOverTime: Array<{ date: string; requests: number; bookings: number }>;
  statusBreakdown: Array<{ name: string; value: number }>;
  availabilityBreakdown: Array<{ name: string; value: number }>;
  crossDeptMatrix: Array<{ department: string; internal: number; crossDept: number }>;
  maintenanceFrequency: Array<{ equipment: string; events: number; hours: number }>;
  conflictTrends: Array<{ date: string; overlappingRequests: number }>;
  metricsForAi: Record<string, number | string>;
}

function clipHours(startMs: number, endMs: number, rangeStartMs: number, rangeEndMs: number): number {
  const s = Math.max(startMs, rangeStartMs);
  const e = Math.min(endMs, rangeEndMs);
  return e > s ? (e - s) / 3600000 : 0;
}

export function computeAnalytics(data: LabLinkDataset, filter: AnalyticsFilter): AnalyticsSnapshot {
  const rangeStartMs = parseIsoMs(`${filter.startDate}T00:00:00`);
  const rangeEndMs = parseIsoMs(`${filter.endDate}T23:59:59`);
  const daysCount = Math.max(1, Math.round((rangeEndMs - rangeStartMs) / (24 * 3600000)));

  const labsById = new Map(data.laboratories.map((l) => [l.id, l]));
  const deptsById = new Map(data.departments.map((d) => [d.id, d]));

  const filteredEq = data.equipment.filter((eq) => {
    if (filter.departmentId && eq.departmentId !== filter.departmentId) return false;
    if (filter.category && eq.category !== filter.category) return false;
    if (filter.laboratoryId && eq.laboratoryId !== filter.laboratoryId) return false;
    return true;
  });
  const eqIds = new Set(filteredEq.map((e) => e.id));

  const activeBookings = data.bookings.filter(
    (b) => eqIds.has(b.equipmentId) && (b.status === 'approved' || b.status === 'checked_in' || b.status === 'completed')
  );
  const filteredMaint = data.maintenance.filter((m) => eqIds.has(m.equipmentId) && m.status !== 'cancelled');
  const filteredReqs = data.bookingRequests.filter((r) => {
    if (!eqIds.has(r.equipmentId)) return false;
    const ms = parseIsoMs(r.requestedStart);
    return ms >= rangeStartMs && ms <= rangeEndMs;
  });

  // Utilization calculation
  let totalOccupiedHours = 0;
  let totalAvailableOperatingHours = 0;

  const deptMap = new Map<string, { occupied: number; available: number; bookings: number }>();
  for (const d of data.departments) {
    deptMap.set(d.id, { occupied: 0, available: 0, bookings: 0 });
  }

  for (const eq of filteredEq) {
    if (!eq.isActive) continue;
    const lab = labsById.get(eq.laboratoryId);
    const open = parseHourMinute(lab?.openHour ?? '09:00');
    const close = parseHourMinute(lab?.closeHour ?? '18:00');
    const dailyLabHours = Math.max(1, close.hour + close.minute / 60 - (open.hour + open.minute / 60));

    let maintHours = 0;
    for (const m of filteredMaint) {
      if (m.equipmentId === eq.id) {
        maintHours += clipHours(parseIsoMs(m.start), parseIsoMs(m.end), rangeStartMs, rangeEndMs);
      }
    }

    const eqAvailHours = Math.max(0, (dailyLabHours * daysCount - maintHours) * Math.max(1, eq.quantity));
    let eqOccupied = 0;
    let eqBookingsCount = 0;

    for (const b of activeBookings) {
      if (b.equipmentId === eq.id) {
        const hrs = clipHours(parseIsoMs(b.start), parseIsoMs(b.end), rangeStartMs, rangeEndMs) * b.units;
        if (hrs > 0) {
          eqOccupied += hrs;
          eqBookingsCount += 1;
        }
      }
    }

    totalOccupiedHours += eqOccupied;
    totalAvailableOperatingHours += eqAvailHours;

    const dm = deptMap.get(eq.departmentId);
    if (dm) {
      dm.occupied += eqOccupied;
      dm.available += eqAvailHours;
      dm.bookings += eqBookingsCount;
    }
  }

  const overallUtilizationPct =
    totalAvailableOperatingHours > 0 ? round1((totalOccupiedHours / totalAvailableOperatingHours) * 100) : 0;

  const byDepartment = data.departments
    .filter((d) => !filter.departmentId || d.id === filter.departmentId)
    .map((d) => {
      const stats = deptMap.get(d.id) ?? { occupied: 0, available: 0, bookings: 0 };
      return {
        departmentId: d.id,
        name: d.name,
        code: d.code,
        utilizationPct: stats.available > 0 ? round1((stats.occupied / stats.available) * 100) : 0,
        occupiedHours: round1(stats.occupied),
        bookings: stats.bookings,
      };
    });

  // Most requested equipment
  const reqCountByEq = new Map<string, { requests: number; approved: number }>();
  for (const r of filteredReqs) {
    const cur = reqCountByEq.get(r.equipmentId) ?? { requests: 0, approved: 0 };
    cur.requests += 1;
    if (r.status === 'approved' || r.status === 'completed') cur.approved += 1;
    reqCountByEq.set(r.equipmentId, cur);
  }
  const mostRequestedEquipment = filteredEq
    .map((eq) => ({
      equipmentId: eq.id,
      code: eq.equipmentId,
      name: eq.name,
      requests: reqCountByEq.get(eq.id)?.requests ?? 0,
      approved: reqCountByEq.get(eq.id)?.approved ?? 0,
    }))
    .sort((a, b) => b.requests - a.requests || b.approved - a.approved)
    .slice(0, 8);

  // Demand over time
  const demandByDay = new Map<string, { requests: number; bookings: number }>();
  for (const r of filteredReqs) {
    const d = r.requestedStart.slice(0, 10);
    const cur = demandByDay.get(d) ?? { requests: 0, bookings: 0 };
    cur.requests += 1;
    demandByDay.set(d, cur);
  }
  for (const b of activeBookings) {
    const ms = parseIsoMs(b.start);
    if (ms >= rangeStartMs && ms <= rangeEndMs) {
      const d = b.start.slice(0, 10);
      const cur = demandByDay.get(d) ?? { requests: 0, bookings: 0 };
      cur.bookings += 1;
      demandByDay.set(d, cur);
    }
  }
  const demandOverTime = Array.from(demandByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, val]) => ({ date, ...val }));

  // Approved vs rejected
  const approvedCnt = filteredReqs.filter((r) => r.status === 'approved' || r.status === 'completed').length;
  const rejectedCnt = filteredReqs.filter((r) => r.status === 'rejected').length;
  const pendingCnt = filteredReqs.filter((r) => ['submitted', 'pending_approval', 'ai_recommended'].includes(r.status)).length;
  const waitlistedCnt = filteredReqs.filter((r) => r.status === 'waitlisted').length;
  const statusBreakdown = [
    { name: 'Approved', value: approvedCnt },
    { name: 'Pending', value: pendingCnt },
    { name: 'Rejected', value: rejectedCnt },
    { name: 'Waitlisted', value: waitlistedCnt },
  ].filter((x) => x.value > 0);

  // Availability breakdown
  const availOperational = filteredEq.filter((e) => e.isActive && e.maintenanceStatus === 'operational').length;
  const availScheduled = filteredEq.filter((e) => e.isActive && e.maintenanceStatus === 'scheduled').length;
  const availMaint = filteredEq.filter((e) => e.maintenanceStatus === 'under_maintenance').length;
  const availInactive = filteredEq.filter((e) => !e.isActive).length;
  const availabilityBreakdown = [
    { name: 'Operational', value: availOperational },
    { name: 'Maint. Scheduled', value: availScheduled },
    { name: 'Under Maintenance', value: availMaint },
    { name: 'Inactive', value: availInactive },
  ].filter((x) => x.value > 0);

  // Cross-department sharing
  const usersById = new Map(data.users.map((u) => [u.id, u]));
  const crossDeptCounter = new Map<string, { internal: number; crossDept: number }>();
  for (const d of data.departments) crossDeptCounter.set(d.id, { internal: 0, crossDept: 0 });
  let totalCrossDept = 0;
  let totalSharedCheck = 0;

  for (const b of activeBookings) {
    const user = usersById.get(b.studentId);
    const eq = filteredEq.find((e) => e.id === b.equipmentId);
    if (!eq) continue;
    totalSharedCheck += 1;
    const isCross = user && user.departmentId !== eq.departmentId;
    const entry = crossDeptCounter.get(eq.departmentId);
    if (entry) {
      if (isCross) {
        entry.crossDept += 1;
        totalCrossDept += 1;
      } else {
        entry.internal += 1;
      }
    }
  }
  const crossDeptMatrix = data.departments.map((d) => ({
    department: d.code,
    ...(crossDeptCounter.get(d.id) ?? { internal: 0, crossDept: 0 }),
  }));

  // Maintenance frequency
  const maintByEq = new Map<string, { events: number; hours: number }>();
  for (const m of filteredMaint) {
    const cur = maintByEq.get(m.equipmentId) ?? { events: 0, hours: 0 };
    cur.events += 1;
    cur.hours += round1(Math.max(0, (parseIsoMs(m.end) - parseIsoMs(m.start)) / 3600000));
    maintByEq.set(m.equipmentId, cur);
  }
  const maintenanceFrequency = Array.from(maintByEq.entries()).map(([eqId, val]) => {
    const eq = data.equipment.find((e) => e.id === eqId);
    return { equipment: eq?.equipmentId ?? eqId, events: val.events, hours: round1(val.hours) };
  });

  // Conflict trends (days where >=2 requests overlap on same equipment)
  const conflictByDay = new Map<string, number>();
  for (let i = 0; i < filteredReqs.length; i++) {
    for (let j = i + 1; j < filteredReqs.length; j++) {
      const r1 = filteredReqs[i];
      const r2 = filteredReqs[j];
      if (
        r1.equipmentId === r2.equipmentId &&
        intervalsOverlap(parseIsoMs(r1.requestedStart), parseIsoMs(r1.requestedEnd), parseIsoMs(r2.requestedStart), parseIsoMs(r2.requestedEnd))
      ) {
        const d = r1.requestedStart.slice(0, 10);
        conflictByDay.set(d, (conflictByDay.get(d) ?? 0) + 1);
      }
    }
  }
  const conflictTrends = Array.from(conflictByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, overlappingRequests]) => ({ date, overlappingRequests }));

  const decidedCount = approvedCnt + rejectedCnt;
  const approvalRatePct = decidedCount > 0 ? round1((approvedCnt / decidedCount) * 100) : 0;
  const crossDepartmentPct = totalSharedCheck > 0 ? round1((totalCrossDept / totalSharedCheck) * 100) : 0;

  const topDept = [...byDepartment].sort((a, b) => b.utilizationPct - a.utilizationPct)[0];

  return {
    utilizationFormula:
      'Utilization = Occupied Approved/Completed Hours (clipped to range) / ((Lab Operating Hours × Days − Maintenance Hours) × Units)',
    overallUtilizationPct,
    occupiedHours: round1(totalOccupiedHours),
    availableOperatingHours: round1(totalAvailableOperatingHours),
    crossDepartmentPct,
    approvalRatePct,
    totalRequests: filteredReqs.length,
    totalConfirmedBookings: activeBookings.length,
    totalMaintenanceEvents: filteredMaint.length,
    byDepartment,
    mostRequestedEquipment,
    demandOverTime,
    statusBreakdown,
    availabilityBreakdown,
    crossDeptMatrix,
    maintenanceFrequency,
    conflictTrends,
    metricsForAi: {
      overallUtilizationPct,
      occupiedHours: round1(totalOccupiedHours),
      availableOperatingHours: round2(totalAvailableOperatingHours),
      crossDepartmentPct,
      approvalRatePct,
      totalRequests: filteredReqs.length,
      totalConfirmedBookings: activeBookings.length,
      topDepartment: topDept ? `${deptsById.get(topDept.departmentId)?.name ?? topDept.name} (${topDept.utilizationPct}%)` : 'N/A',
      maintenanceEvents: filteredMaint.length,
    },
  };
}
