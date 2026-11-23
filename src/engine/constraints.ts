import type {
  Booking,
  BookingRequest,
  ConstraintCheck,
  Equipment,
  EquipmentSpecs,
  Laboratory,
  MaintenanceRecord,
  Project,
  UserProfile,
} from '../types/models';
import {
  endOfCalendarDayMs,
  makeDayTimeMs,
  parseIsoMs,
  toDateKey,
} from './constants';

export interface Interval {
  id: string;
  startMs: number;
  endMs: number;
  units: number;
}

export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function checkSpecsMatch(
  requiredSpecs: Partial<EquipmentSpecs> | undefined,
  equipmentSpecs: EquipmentSpecs
): { passed: boolean; detail: string; matchRatio: number } {
  if (!requiredSpecs || Object.keys(requiredSpecs).length === 0) {
    return { passed: true, detail: 'No special hardware requirements specified.', matchRatio: 1 };
  }

  const entries = Object.entries(requiredSpecs).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) {
    return { passed: true, detail: 'No special hardware requirements specified.', matchRatio: 1 };
  }

  const failures: string[] = [];
  let matchedCount = 0;

  for (const [key, reqVal] of entries) {
    const actualVal = equipmentSpecs[key];
    if (typeof reqVal === 'boolean') {
      if (reqVal && actualVal !== true) {
        failures.push(`Requires ${key}=true (equipment has ${String(actualVal ?? false)})`);
      } else {
        matchedCount += 1;
      }
    } else if (typeof reqVal === 'number') {
      if (typeof actualVal !== 'number' || actualVal < reqVal) {
        failures.push(`Requires ${key} >= ${reqVal} (equipment has ${String(actualVal ?? 0)})`);
      } else {
        matchedCount += 1;
      }
    } else if (typeof reqVal === 'string') {
      if (String(actualVal ?? '').toLowerCase() !== reqVal.toLowerCase()) {
        failures.push(`Requires ${key}=${reqVal} (equipment has ${String(actualVal ?? 'none')})`);
      } else {
        matchedCount += 1;
      }
    }
  }

  const matchRatio = matchedCount / entries.length;
  if (failures.length > 0) {
    return { passed: false, detail: failures.join('; '), matchRatio };
  }
  return { passed: true, detail: `All ${entries.length} specification requirements satisfied.`, matchRatio };
}

export function isWithinLabHours(startMs: number, endMs: number, lab?: Laboratory): { passed: boolean; detail: string } {
  const openHour = lab?.openHour ?? '09:00';
  const closeHour = lab?.closeHour ?? '18:00';
  const startDay = toDateKey(startMs);
  const endDay = toDateKey(endMs - 1);

  if (startDay !== endDay) {
    return { passed: false, detail: `Slot spans multiple days (${startDay} to ${endDay}), exceeding single-day lab hours (${openHour}-${closeHour}).` };
  }

  const openMs = makeDayTimeMs(startDay, openHour);
  const closeMs = makeDayTimeMs(startDay, closeHour);
  if (startMs < openMs || endMs > closeMs) {
    return { passed: false, detail: `Requested window falls outside lab hours (${openHour}-${closeHour}).` };
  }
  return { passed: true, detail: `Within laboratory operating hours (${openHour}-${closeHour}).` };
}

export function getConcurrentUnits(
  startMs: number,
  endMs: number,
  intervals: Interval[]
): number {
  const overlapping = intervals.filter((iv) => intervalsOverlap(startMs, endMs, iv.startMs, iv.endMs));
  if (overlapping.length === 0) return 0;

  // Sweep-line peak concurrent unit calculation
  const events: Array<{ t: number; delta: number }> = [];
  for (const iv of overlapping) {
    events.push({ t: Math.max(startMs, iv.startMs), delta: iv.units });
    events.push({ t: Math.min(endMs, iv.endMs), delta: -iv.units });
  }
  events.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.delta - b.delta));

  let current = 0;
  let peak = 0;
  for (const ev of events) {
    current += ev.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

export function getDeadlineCutoffMs(project?: Project): number | null {
  if (!project?.deadline) return null;
  if (project.deadlineType === 'end_of_day') {
    return endOfCalendarDayMs(project.deadline);
  }
  return parseIsoMs(project.deadline);
}

export interface HardConstraintContext {
  request: BookingRequest;
  equipment: Equipment | undefined;
  laboratory: Laboratory | undefined;
  project: Project | undefined;
  student: UserProfile | undefined;
  confirmedIntervals: Interval[];
  maintenanceRecords: MaintenanceRecord[];
  nowIso: string;
}

export function evaluateHardConstraints(ctx: HardConstraintContext): ConstraintCheck[] {
  const {
    request,
    equipment,
    laboratory,
    project,
    student,
    confirmedIntervals,
    maintenanceRecords,
    nowIso,
  } = ctx;

  const checks: ConstraintCheck[] = [];
  const startMs = parseIsoMs(request.requestedStart);
  const endMs = parseIsoMs(request.requestedEnd);
  const nowMs = parseIsoMs(nowIso);
  const durationMins = (endMs - startMs) / 60000;

  // 1. EQUIPMENT_INACTIVE
  const isInactive = !equipment || !equipment.isActive || equipment.status === 'inactive';
  checks.push({
    code: 'EQUIPMENT_INACTIVE',
    passed: !isInactive,
    detail: !equipment
      ? `Equipment ${request.equipmentId} was not found.`
      : isInactive
      ? `${equipment.name} is currently deactivated.`
      : `${equipment.name} is active in catalog.`,
  });

  // 2. EQUIPMENT_UNAVAILABLE
  const isUnavailable = !equipment || equipment.quantity <= 0 || equipment.maintenanceStatus === 'under_maintenance';
  checks.push({
    code: 'EQUIPMENT_UNAVAILABLE',
    passed: !isUnavailable,
    detail: !equipment
      ? 'Equipment unavailable.'
      : equipment.quantity <= 0
      ? 'Zero operational units available.'
      : equipment.maintenanceStatus === 'under_maintenance'
      ? `${equipment.name} is currently under maintenance.`
      : `${equipment.quantity} unit(s) operational.`,
  });

  // 3. INVALID_TIME_RANGE
  const invalidTime =
    Number.isNaN(startMs) ||
    Number.isNaN(endMs) ||
    endMs <= startMs ||
    startMs < nowMs ||
    request.units < 1;
  checks.push({
    code: 'INVALID_TIME_RANGE',
    passed: !invalidTime,
    detail: Number.isNaN(startMs) || Number.isNaN(endMs)
      ? 'Malformed start or end timestamp.'
      : endMs <= startMs
      ? 'End time must be strictly after start time.'
      : startMs < nowMs
      ? 'Requested start time is in the past.'
      : request.units < 1
      ? 'Requested units must be at least 1.'
      : `Valid slot range (${Math.round(durationMins)} mins).`,
  });

  // 4. BELOW_MIN_DURATION
  const minMins = equipment?.minBookingMins ?? 30;
  const belowMin = !Number.isNaN(durationMins) && durationMins > 0 && durationMins < minMins;
  checks.push({
    code: 'BELOW_MIN_DURATION',
    passed: !belowMin,
    detail: belowMin
      ? `Duration ${Math.round(durationMins)}m is below minimum ${minMins}m.`
      : `Meets minimum duration (${minMins}m).`,
  });

  // 5. EXCEEDS_MAX_DURATION
  const maxMins = equipment?.maxBookingMins ?? 240;
  const exceedsMax = !Number.isNaN(durationMins) && durationMins > maxMins;
  checks.push({
    code: 'EXCEEDS_MAX_DURATION',
    passed: !exceedsMax,
    detail: exceedsMax
      ? `Duration ${Math.round(durationMins)}m exceeds maximum ${maxMins}m.`
      : `Within maximum duration (${maxMins}m).`,
  });

  // 6. OUTSIDE_LAB_HOURS
  const labHoursCheck = !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs
    ? isWithinLabHours(startMs, endMs, laboratory)
    : { passed: false, detail: 'Cannot validate lab hours due to invalid time range.' };
  checks.push({
    code: 'OUTSIDE_LAB_HOURS',
    passed: labHoursCheck.passed,
    detail: labHoursCheck.detail,
  });

  // 7. MAINTENANCE_OVERLAP
  const activeMaint = maintenanceRecords.filter(
    (m) => m.equipmentId === request.equipmentId && (m.status === 'scheduled' || m.status === 'in_progress')
  );
  const maintConflict = activeMaint.find((m) =>
    intervalsOverlap(startMs, endMs, parseIsoMs(m.start), parseIsoMs(m.end))
  );
  checks.push({
    code: 'MAINTENANCE_OVERLAP',
    passed: !maintConflict,
    detail: maintConflict
      ? `Overlaps scheduled maintenance "${maintConflict.title}" (${maintConflict.start} to ${maintConflict.end}).`
      : 'No maintenance overlap during requested window.',
  });

  // 8. OVERLAPS_CONFIRMED_BOOKING (capacity-aware)
  const eqQuantity = equipment?.quantity ?? 1;
  const eqConfirmed = confirmedIntervals.filter((iv) => intervalsOverlap(startMs, endMs, iv.startMs, iv.endMs));
  const peakOccupied = getConcurrentUnits(startMs, endMs, eqConfirmed);
  const overlapsConfirmed = peakOccupied + request.units > eqQuantity;
  checks.push({
    code: 'OVERLAPS_CONFIRMED_BOOKING',
    passed: !overlapsConfirmed,
    detail: overlapsConfirmed
      ? `Capacity exceeded: ${peakOccupied}/${eqQuantity} units already booked in this window.`
      : `Capacity available (${peakOccupied}/${eqQuantity} units occupied).`,
  });

  // 9. SPEC_MISMATCH
  const specCheck = equipment
    ? checkSpecsMatch(request.requiredSpecs, equipment.specs)
    : { passed: false, detail: 'Equipment not found for spec check.', matchRatio: 0 };
  checks.push({
    code: 'SPEC_MISMATCH',
    passed: specCheck.passed,
    detail: specCheck.detail,
  });

  // 10. ACCESS_NOT_PERMITTED
  const needsCert = Boolean(equipment?.requiresCertification && equipment?.requiredCertification);
  const hasCert = !needsCert || (student?.certifications ?? []).includes(equipment!.requiredCertification!);
  const isSuspended = student?.status === 'suspended';
  const accessOk = hasCert && !isSuspended;
  checks.push({
    code: 'ACCESS_NOT_PERMITTED',
    passed: accessOk,
    detail: isSuspended
      ? 'Requester account is suspended.'
      : !hasCert
      ? `Requires certification: ${equipment?.requiredCertification}.`
      : 'Requester authorized for this equipment.',
  });

  // 11. SAFETY_RESTRICTION
  const restricted =
    equipment?.condition === 'needs_service' ||
    (Boolean(equipment?.usageRestrictions?.toLowerCase().includes('faculty_supervision_only')) &&
      request.units > 1);
  checks.push({
    code: 'SAFETY_RESTRICTION',
    passed: !restricted,
    detail: restricted
      ? 'Safety restriction active: equipment requires servicing or single-unit supervised operation.'
      : 'Safety and operational checks passed.',
  });

  // 12. DEADLINE_BEFORE_SLOT_END
  const cutoffMs = getDeadlineCutoffMs(project);
  const pastDeadline = cutoffMs !== null && !Number.isNaN(endMs) && endMs > cutoffMs;
  checks.push({
    code: 'DEADLINE_BEFORE_SLOT_END',
    passed: !pastDeadline,
    detail: pastDeadline
      ? `Requested slot ends after project deadline (${project?.deadline}).`
      : 'Slot completes within project deadline.',
  });

  return checks;
}

export function bookingsToIntervals(bookings: Booking[], equipmentId: string): Interval[] {
  return bookings
    .filter((b) => b.equipmentId === equipmentId && (b.status === 'approved' || b.status === 'checked_in'))
    .map((b) => ({
      id: b.id,
      startMs: parseIsoMs(b.start),
      endMs: parseIsoMs(b.end),
      units: b.units,
    }));
}
