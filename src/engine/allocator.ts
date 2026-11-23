import type {
  AllocationRequestResult,
  AllocationResult,
  AllocationWeights,
  AlternativeEquipmentOption,
  AlternativeSlotOption,
  Booking,
  BookingRequest,
  ConflictGroupSummary,
  Equipment,
  EquipmentDaySchedule,
  Laboratory,
  MaintenanceRecord,
  Project,
  RequestAlternatives,
  SplitBookingOption,
  UsageLog,
  UserProfile,
  WhatIfDiffItem,
  WhatIfResult,
} from '../types/models';
import {
  COMPATIBLE_CATEGORIES,
  DEFAULT_FAIR_USE_LIMIT_HOURS,
  ENGINE_VERSION,
  formatLocalIso,
  makeDayTimeMs,
  parseIsoMs,
  round1,
  toDateKey,
} from './constants';
import {
  bookingsToIntervals,
  checkSpecsMatch,
  evaluateHardConstraints,
  getConcurrentUnits,
  getDeadlineCutoffMs,
  Interval,
  intervalsOverlap,
} from './constraints';
import {
  buildScoreBreakdown,
  computeFairnessScore,
  computeUsedHoursInWindow,
  findEarliestFeasibleSlot,
  isSlotFreeOnEquipment,
  normalizeWeights,
} from './scoring';

export interface EngineInput {
  requests: BookingRequest[];
  equipment: Equipment[];
  laboratories: Laboratory[];
  projects: Project[];
  users: UserProfile[];
  bookings: Booking[];
  maintenance: MaintenanceRecord[];
  usageLogs: UsageLog[];
  weights?: Partial<AllocationWeights>;
  fairUseLimitHours?: number;
  enforceFairUseHard?: boolean;
  targetEquipmentId?: string;
  targetDate?: string;
}

function findSameEquipmentAlternativeSlots(
  durationMs: number,
  units: number,
  equipment: Equipment,
  lab: Laboratory | undefined,
  tentativeIntervals: Interval[],
  maintenanceRecords: MaintenanceRecord[],
  requestedStartMs: number,
  deadlineCutoffMs: number | null,
  limit = 3
): AlternativeSlotOption[] {
  const options: AlternativeSlotOption[] = [];
  const stepMs = 60 * 60000;
  const openHour = lab?.openHour ?? '09:00';
  const closeHour = lab?.closeHour ?? '18:00';
  const startDate = new Date(requestedStartMs);

  for (let dayOffset = 0; dayOffset < 7 && options.length < limit; dayOffset++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset);
    const dayKey = toDateKey(d.getTime());
    const dayOpenMs = makeDayTimeMs(dayKey, openHour);
    const dayCloseMs = makeDayTimeMs(dayKey, closeHour);
    const cursorStart = dayOffset === 0 ? Math.max(dayOpenMs, requestedStartMs) : dayOpenMs;

    for (let cursor = cursorStart; cursor + durationMs <= dayCloseMs && options.length < limit; cursor += stepMs) {
      const endCursor = cursor + durationMs;
      if (deadlineCutoffMs !== null && endCursor > deadlineCutoffMs) break;
      if (
        cursor !== requestedStartMs &&
        isSlotFreeOnEquipment(cursor, endCursor, units, equipment, lab, tentativeIntervals, maintenanceRecords)
      ) {
        const overlapsExisting = options.some((o) =>
          intervalsOverlap(cursor, endCursor, parseIsoMs(o.start), parseIsoMs(o.end))
        );
        if (!overlapsExisting) {
          options.push({
            start: formatLocalIso(cursor),
            end: formatLocalIso(endCursor),
            equipmentId: equipment.id,
            reason: dayOffset === 0 ? 'Available same-day window outside confirmed & higher-priority allocations.' : `Available on ${dayKey} within lab hours and project deadline.`,
          });
        }
      }
    }
  }
  return options;
}

function findAlternativeEquipmentOptions(
  request: BookingRequest,
  primaryEq: Equipment,
  allEquipment: Equipment[],
  labsById: Map<string, Laboratory>,
  tentativeByEq: Map<string, Interval[]>,
  maintenance: MaintenanceRecord[],
  deadlineCutoffMs: number | null
): { alternativeEquipment: AlternativeEquipmentOption[]; nearbyLabs: AlternativeEquipmentOption[] } {
  const compatCats = COMPATIBLE_CATEGORIES[primaryEq.category] ?? [primaryEq.category];
  const startMs = parseIsoMs(request.requestedStart);
  const endMs = parseIsoMs(request.requestedEnd);
  const durationMs = endMs - startMs;

  const altEq: AlternativeEquipmentOption[] = [];
  const nearby: AlternativeEquipmentOption[] = [];

  for (const eq of allEquipment) {
    if (eq.id === primaryEq.id) continue;
    if (!eq.isActive || eq.status === 'inactive' || eq.maintenanceStatus === 'under_maintenance') continue;
    if (!compatCats.includes(eq.category)) continue;

    const specCheck = checkSpecsMatch(request.requiredSpecs, eq.specs);
    if (!specCheck.passed) continue;

    const lab = labsById.get(eq.laboratoryId);
    const intervals = tentativeByEq.get(eq.id) ?? [];

    let chosenStart: number | null = null;
    let chosenEnd: number | null = null;

    if (isSlotFreeOnEquipment(startMs, endMs, request.units, eq, lab, intervals, maintenance)) {
      chosenStart = startMs;
      chosenEnd = endMs;
    } else {
      const earliest = findEarliestFeasibleSlot(durationMs, request.units, eq, lab, intervals, maintenance, startMs, deadlineCutoffMs, 5);
      if (earliest) {
        chosenStart = earliest.startMs;
        chosenEnd = earliest.endMs;
      }
    }

    if (chosenStart !== null && chosenEnd !== null) {
      const sameBuilding = eq.building === primaryEq.building;
      const sameDepartment = eq.departmentId === primaryEq.departmentId;
      const option: AlternativeEquipmentOption = {
        equipmentId: eq.id,
        equipmentCode: eq.equipmentId,
        name: eq.name,
        category: eq.category,
        building: eq.building,
        laboratoryName: lab?.name ?? eq.location,
        sameDepartment,
        specMatchScore: Math.round(specCheck.matchRatio * 100),
        start: formatLocalIso(chosenStart),
        end: formatLocalIso(chosenEnd),
        reason: chosenStart === startMs
          ? `Free in exact requested window (${eq.building}).`
          : `Next free compatible slot on ${toDateKey(chosenStart)} in ${lab?.name ?? eq.building}.`,
      };

      altEq.push(option);
      if (sameBuilding || !sameDepartment) {
        nearby.push({
          ...option,
          reason: sameBuilding
            ? `Same building (${eq.building}) · ${option.reason}`
            : `Cross-department campus lab (${eq.building}) · ${option.reason}`,
        });
      }
    }
  }

  altEq.sort((a, b) => b.specMatchScore - a.specMatchScore || (a.sameDepartment === b.sameDepartment ? 0 : a.sameDepartment ? -1 : 1));
  nearby.sort((a, b) => (a.building === primaryEq.building ? -1 : 1) - (b.building === primaryEq.building ? -1 : 1));

  return {
    alternativeEquipment: altEq.slice(0, 4),
    nearbyLabs: nearby.slice(0, 4),
  };
}

function findSplitBookingOptions(
  durationMs: number,
  units: number,
  equipment: Equipment,
  lab: Laboratory | undefined,
  intervals: Interval[],
  maintenance: MaintenanceRecord[],
  searchStartMs: number,
  deadlineCutoffMs: number | null
): SplitBookingOption[] {
  if (!equipment.allowsSplitBooking) return [];
  const stepMs = 30 * 60000;
  const minSegMs = Math.max(equipment.minBookingMins * 60000, stepMs);
  const openHour = lab?.openHour ?? '09:00';
  const closeHour = lab?.closeHour ?? '18:00';
  const neededMins = Math.round(durationMs / 60000);

  const segments: Array<{ start: string; end: string }> = [];
  let accumulatedMins = 0;

  const startDate = new Date(searchStartMs);
  for (let dayOffset = 0; dayOffset < 3 && accumulatedMins < neededMins; dayOffset++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayOffset);
    const dayKey = toDateKey(d.getTime());
    const dayOpenMs = makeDayTimeMs(dayKey, openHour);
    const dayCloseMs = makeDayTimeMs(dayKey, closeHour);
    const cursorStart = dayOffset === 0 ? Math.max(dayOpenMs, searchStartMs) : dayOpenMs;

    let segStart: number | null = null;
    for (let cursor = cursorStart; cursor <= dayCloseMs && accumulatedMins < neededMins; cursor += stepMs) {
      const slotEnd = cursor + stepMs;
      const canUse =
        slotEnd <= dayCloseMs &&
        (deadlineCutoffMs === null || slotEnd <= deadlineCutoffMs) &&
        isSlotFreeOnEquipment(cursor, slotEnd, units, equipment, lab, intervals, maintenance);

      if (canUse) {
        if (segStart === null) segStart = cursor;
      } else if (segStart !== null) {
        const segLen = cursor - segStart;
        if (segLen >= minSegMs) {
          const takeMs = Math.min(segLen, (neededMins - accumulatedMins) * 60000);
          segments.push({ start: formatLocalIso(segStart), end: formatLocalIso(segStart + takeMs) });
          accumulatedMins += Math.round(takeMs / 60000);
        }
        segStart = null;
      }
    }
    if (segStart !== null && accumulatedMins < neededMins) {
      const segLen = dayCloseMs - segStart;
      if (segLen >= minSegMs) {
        const takeMs = Math.min(segLen, (neededMins - accumulatedMins) * 60000);
        segments.push({ start: formatLocalIso(segStart), end: formatLocalIso(segStart + takeMs) });
        accumulatedMins += Math.round(takeMs / 60000);
      }
    }
  }

  if (segments.length >= 2 && accumulatedMins >= neededMins) {
    return [
      {
        segments,
        totalMins: accumulatedMins,
        reason: `Split across ${segments.length} continuous blocks totaling ${accumulatedMins} mins.`,
      },
    ];
  }
  return [];
}

export function runAllocationEngine(input: EngineInput, nowIso: string): AllocationResult {
  const weights = normalizeWeights(input.weights);
  const fairUseLimit = input.fairUseLimitHours ?? DEFAULT_FAIR_USE_LIMIT_HOURS;
  const enforceFairUseHard = Boolean(input.enforceFairUseHard);

  const equipmentById = new Map(input.equipment.map((e) => [e.id, e]));
  const labsById = new Map(input.laboratories.map((l) => [l.id, l]));
  const projectsById = new Map(input.projects.map((p) => [p.id, p]));
  const usersById = new Map(input.users.map((u) => [u.id, u]));

  const confirmedIntervalsByEq = new Map<string, Interval[]>();
  for (const eq of input.equipment) {
    confirmedIntervalsByEq.set(eq.id, bookingsToIntervals(input.bookings, eq.id));
  }

  // Filter active pending requests
  const candidateRequests = input.requests.filter((r) => {
    if (input.targetEquipmentId && r.equipmentId !== input.targetEquipmentId) return false;
    if (input.targetDate && r.requestedStart.slice(0, 10) !== input.targetDate) return false;
    return ['submitted', 'pending_approval', 'ai_recommended'].includes(r.status);
  });

  // Group conflict detection
  const groupsMap = new Map<string, BookingRequest[]>();
  for (const req of candidateRequests) {
    const key = `${req.equipmentId}__${req.requestedStart.slice(0, 10)}`;
    const list = groupsMap.get(key) ?? [];
    list.push(req);
    groupsMap.set(key, list);
  }

  const conflictGroups: ConflictGroupSummary[] = Array.from(groupsMap.entries()).map(([key, reqs]) => {
    const [equipmentId, date] = key.split('__');
    const eq = equipmentById.get(equipmentId);
    let hasConflict = false;
    for (let i = 0; i < reqs.length; i++) {
      for (let j = i + 1; j < reqs.length; j++) {
        if (
          intervalsOverlap(
            parseIsoMs(reqs[i].requestedStart),
            parseIsoMs(reqs[i].requestedEnd),
            parseIsoMs(reqs[j].requestedStart),
            parseIsoMs(reqs[j].requestedEnd)
          )
        ) {
          if (reqs[i].units + reqs[j].units > (eq?.quantity ?? 1)) {
            hasConflict = true;
          }
        }
      }
    }
    return {
      equipmentId,
      date,
      requestIds: reqs.map((r) => r.id),
      hasConflict: hasConflict || reqs.length > 1,
    };
  });

  interface ScoredCandidate {
    request: BookingRequest;
    checks: ReturnType<typeof evaluateHardConstraints>;
    scoreResult: ReturnType<typeof buildScoreBreakdown>;
    flags: string[];
  }

  const ineligibleEntries: AllocationRequestResult[] = [];
  const eligibleCandidates: ScoredCandidate[] = [];

  for (const req of candidateRequests) {
    const eq = equipmentById.get(req.equipmentId);
    const lab = eq ? labsById.get(eq.laboratoryId) : undefined;
    const project = projectsById.get(req.projectId);
    const student = usersById.get(req.studentId);
    const confirmed = confirmedIntervalsByEq.get(req.equipmentId) ?? [];

    const checks = evaluateHardConstraints({
      request: req,
      equipment: eq,
      laboratory: lab,
      project,
      student,
      confirmedIntervals: confirmed,
      maintenanceRecords: input.maintenance,
      nowIso,
    });

    const failedChecks = checks.filter((c) => !c.passed);

    const usedHours = computeUsedHoursInWindow(req.studentId, input.usageLogs, nowIso, 30);
    const fairnessCheck = computeFairnessScore(usedHours, fairUseLimit);

    if (failedChecks.length > 0 || !eq || (enforceFairUseHard && fairnessCheck.exceeded)) {
      const reasons = failedChecks.map((f) => `${f.code}: ${f.detail}`);
      if (enforceFairUseHard && fairnessCheck.exceeded) {
        reasons.push(`FAIR_USE_EXCEEDED: Used ${usedHours}h exceeds hard limit of ${fairUseLimit}h.`);
      }

      const cutoffMs = getDeadlineCutoffMs(project);
      const startMs = parseIsoMs(req.requestedStart);
      const endMs = parseIsoMs(req.requestedEnd);
      const durationMs = Math.max(30 * 60000, endMs - startMs);

      const altSlots = eq
        ? findSameEquipmentAlternativeSlots(
            durationMs,
            req.units,
            eq,
            lab,
            confirmed,
            input.maintenance,
            Math.max(parseIsoMs(nowIso), startMs),
            cutoffMs
          )
        : [];
      const altEqRes = eq
        ? findAlternativeEquipmentOptions(req, eq, input.equipment, labsById, confirmedIntervalsByEq, input.maintenance, cutoffMs)
        : { alternativeEquipment: [], nearbyLabs: [] };

      ineligibleEntries.push({
        requestId: req.id,
        studentId: req.studentId,
        projectId: req.projectId,
        equipmentId: req.equipmentId,
        eligibility: 'INELIGIBLE',
        constraintChecks: checks,
        scoreBreakdown: null,
        rank: null,
        recommendedSlot: null,
        alternatives: {
          sameEquipmentSlots: altSlots,
          alternativeEquipment: altEqRes.alternativeEquipment,
          nearbyLabs: altEqRes.nearbyLabs,
          splitOptions: [],
          waitlistEligible: {
            eligible: true,
            fairnessScore: fairnessCheck.score,
            reason: `Waitlist rank uses fairness score (${round1(fairnessCheck.score)}/100).`,
          },
        },
        flags: fairnessCheck.exceeded ? ['FAIR_USE_EXCEEDED'] : [],
        reasons,
      });
      continue;
    }

    const cutoffMs = getDeadlineCutoffMs(project);
    const scoreResult = buildScoreBreakdown({
      request: req,
      project,
      equipment: eq,
      allEquipment: input.equipment,
      labsById,
      confirmedIntervalsByEq,
      maintenanceRecords: input.maintenance,
      usageLogs: input.usageLogs,
      weights,
      fairUseLimitHours: fairUseLimit,
      nowIso,
      deadlineCutoffMs: cutoffMs,
    });

    const flags: string[] = [];
    if (scoreResult.fairUseExceeded) flags.push('FAIR_USE_EXCEEDED');
    if (scoreResult.isPastDeadline) flags.push('PAST_DEADLINE');

    eligibleCandidates.push({
      request: req,
      checks,
      scoreResult,
      flags,
    });
  }

  // Sort eligible candidates: highest total score, tie-break by deadline score -> lower usedHours -> earlier submittedAt -> requestId
  eligibleCandidates.sort((a, b) => {
    const scoreDiff = b.scoreResult.breakdown.total - a.scoreResult.breakdown.total;
    if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
    const deadlineDiff = b.scoreResult.breakdown.deadline.score - a.scoreResult.breakdown.deadline.score;
    if (Math.abs(deadlineDiff) > 1e-6) return deadlineDiff;
    const usageDiff = a.scoreResult.usedHours - b.scoreResult.usedHours;
    if (Math.abs(usageDiff) > 1e-6) return usageDiff;
    const subDiff = parseIsoMs(a.request.submittedAt) - parseIsoMs(b.request.submittedAt);
    if (subDiff !== 0) return subDiff;
    return a.request.id.localeCompare(b.request.id);
  });

  // Tentative intervals clone for sequential slot assignment
  const tentativeByEq = new Map<string, Interval[]>();
  for (const [eqId, list] of confirmedIntervalsByEq.entries()) {
    tentativeByEq.set(eqId, [...list]);
  }

  const eligibleEntries: AllocationRequestResult[] = eligibleCandidates.map((item, idx) => {
    const rank = idx + 1;
    const req = item.request;
    const eq = equipmentById.get(req.equipmentId)!;
    const lab = labsById.get(eq.laboratoryId);
    const project = projectsById.get(req.projectId);
    const cutoffMs = getDeadlineCutoffMs(project);
    const tentative = tentativeByEq.get(eq.id) ?? [];

    const reqStartMs = parseIsoMs(req.requestedStart);
    const reqEndMs = parseIsoMs(req.requestedEnd);
    const durationMs = reqEndMs - reqStartMs;

    let recommendedSlot: AllocationRequestResult['recommendedSlot'] = null;
    const reasons: string[] = [];

    if (isSlotFreeOnEquipment(reqStartMs, reqEndMs, req.units, eq, lab, tentative, input.maintenance)) {
      recommendedSlot = {
        start: req.requestedStart,
        end: req.requestedEnd,
        equipmentId: eq.id,
        equipmentName: eq.name,
      };
      tentative.push({ id: req.id, startMs: reqStartMs, endMs: reqEndMs, units: req.units });
      reasons.push(`Rank #${rank} (${item.scoreResult.breakdown.total}): Assigned requested window ${req.requestedStart.slice(11, 16)}-${req.requestedEnd.slice(11, 16)}.`);
    } else {
      const searchFrom = Math.max(parseIsoMs(nowIso), makeDayTimeMs(toDateKey(reqStartMs), lab?.openHour ?? '09:00'));
      const shifted = findEarliestFeasibleSlot(
        durationMs,
        req.units,
        eq,
        lab,
        tentative,
        input.maintenance,
        searchFrom,
        cutoffMs
      );
      if (shifted) {
        recommendedSlot = {
          start: formatLocalIso(shifted.startMs),
          end: formatLocalIso(shifted.endMs),
          equipmentId: eq.id,
          equipmentName: eq.name,
        };
        tentative.push({ id: req.id, startMs: shifted.startMs, endMs: shifted.endMs, units: req.units });
        reasons.push(
          `Rank #${rank} (${item.scoreResult.breakdown.total}): Requested window occupied by higher-priority allocation; shifted to earliest feasible window ${toDateKey(shifted.startMs)} ${formatLocalIso(shifted.startMs).slice(11, 16)}-${formatLocalIso(shifted.endMs).slice(11, 16)}.`
        );
      } else {
        reasons.push(`Rank #${rank} (${item.scoreResult.breakdown.total}): No continuous feasible slot before project deadline on ${eq.equipmentId}.`);
      }
    }

    if (item.flags.includes('FAIR_USE_EXCEEDED')) {
      reasons.push(`Fairness notice: ${item.scoreResult.usedHours}h logged in 30d exceeds ${fairUseLimit}h threshold.`);
    }

    const altSlots = findSameEquipmentAlternativeSlots(
      durationMs,
      req.units,
      eq,
      lab,
      tentative,
      input.maintenance,
      Math.max(parseIsoMs(nowIso), reqStartMs),
      cutoffMs
    );
    const altEqRes = findAlternativeEquipmentOptions(req, eq, input.equipment, labsById, tentativeByEq, input.maintenance, cutoffMs);
    const splitOptions = findSplitBookingOptions(
      durationMs,
      req.units,
      eq,
      lab,
      tentative,
      input.maintenance,
      Math.max(parseIsoMs(nowIso), reqStartMs),
      cutoffMs
    );

    return {
      requestId: req.id,
      studentId: req.studentId,
      projectId: req.projectId,
      equipmentId: req.equipmentId,
      eligibility: 'ELIGIBLE',
      constraintChecks: item.checks,
      scoreBreakdown: item.scoreResult.breakdown,
      rank,
      recommendedSlot,
      alternatives: {
        sameEquipmentSlots: altSlots,
        alternativeEquipment: altEqRes.alternativeEquipment,
        nearbyLabs: altEqRes.nearbyLabs,
        splitOptions,
        waitlistEligible: {
          eligible: true,
          fairnessScore: item.scoreResult.breakdown.fairness.score,
          reason: `Waitlist fairness score: ${item.scoreResult.breakdown.fairness.score}/100.`,
        },
      },
      flags: item.flags,
      reasons,
    };
  });

  const primaryEqId = input.targetEquipmentId ?? candidateRequests[0]?.equipmentId ?? input.equipment[0]?.id ?? 'all';
  const primaryDate = input.targetDate ?? candidateRequests[0]?.requestedStart.slice(0, 10) ?? toDateKey(parseIsoMs(nowIso));

  return {
    id: `alloc_${primaryEqId}_${primaryDate}`,
    equipmentId: primaryEqId,
    date: primaryDate,
    engineVersion: ENGINE_VERSION,
    weightsUsed: weights,
    requestIds: candidateRequests.map((r) => r.id),
    entries: [...eligibleEntries, ...ineligibleEntries],
    conflictGroups,
    computedAt: nowIso,
    status: 'active',
    isDemo: candidateRequests.some((r) => r.isDemo),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function runWhatIf(
  input: EngineInput,
  simulatedWeights: Partial<AllocationWeights>,
  nowIso: string
): WhatIfResult {
  // Pure cloning to guarantee zero mutation of input
  const clonedInput: EngineInput = structuredClone(input);
  const baseline = runAllocationEngine(clonedInput, nowIso);
  const simulated = runAllocationEngine({ ...clonedInput, weights: simulatedWeights }, nowIso);

  const simByReq = new Map(simulated.entries.map((e) => [e.requestId, e]));
  const diffs: WhatIfDiffItem[] = baseline.entries.map((baseEntry) => {
    const simEntry = simByReq.get(baseEntry.requestId);
    const bRank = baseEntry.rank;
    const sRank = simEntry?.rank ?? null;
    const bScore = baseEntry.scoreBreakdown?.total ?? 0;
    const sScore = simEntry?.scoreBreakdown?.total ?? 0;
    const bSlot = baseEntry.recommendedSlot;
    const sSlot = simEntry?.recommendedSlot ?? null;

    let summary = 'No rank or slot change.';
    if (bRank !== sRank) {
      summary = `Rank moves #${bRank ?? '-'} -> #${sRank ?? '-'}`;
    } else if (bSlot?.start !== sSlot?.start) {
      summary = `Slot shifts ${bSlot?.start.slice(11, 16) ?? 'none'} -> ${sSlot?.start.slice(11, 16) ?? 'none'}`;
    } else if (Math.abs(bScore - sScore) > 0.05) {
      summary = `Score ${bScore} -> ${sScore}`;
    }

    return {
      requestId: baseEntry.requestId,
      baselineRank: bRank,
      simulatedRank: sRank,
      baselineScore: bScore,
      simulatedScore: sScore,
      baselineSlot: bSlot,
      simulatedSlot: sSlot,
      summary,
    };
  });

  return { baseline, simulated, diffs };
}

/**
 * Pure transactional ScheduleStore simulating Firestore's per-equipment per-day schedule
 * documents and optimistic/atomic conflict validation for concurrency testing.
 */
export class ScheduleStore {
  private schedules = new Map<string, EquipmentDaySchedule>();
  private locks = new Set<string>();

  constructor(initialSchedules: EquipmentDaySchedule[] = []) {
    for (const s of initialSchedules) {
      this.schedules.set(`${s.equipmentId}_${s.date}`, structuredClone(s));
    }
  }

  getSchedule(equipmentId: string, date: string): EquipmentDaySchedule | undefined {
    const found = this.schedules.get(`${equipmentId}_${date}`);
    return found ? structuredClone(found) : undefined;
  }

  async confirmBooking(params: {
    bookingId: string;
    equipment: Equipment;
    lab?: Laboratory;
    maintenance: MaintenanceRecord[];
    start: string;
    end: string;
    units: number;
    nowIso: string;
  }): Promise<EquipmentDaySchedule> {
    const date = params.start.slice(0, 10);
    const key = `${params.equipment.id}_${date}`;

    if (this.locks.has(key)) {
      throw new Error('TRANSACTION_ABORTED: Concurrent transaction conflict on schedule.');
    }
    this.locks.add(key);

    try {
      const existing = this.schedules.get(key);
      const intervals: Interval[] = (existing?.intervals ?? []).map((iv) => ({
        id: iv.bookingId,
        startMs: parseIsoMs(iv.start),
        endMs: parseIsoMs(iv.end),
        units: iv.units,
      }));

      const startMs = parseIsoMs(params.start);
      const endMs = parseIsoMs(params.end);

      if (!isSlotFreeOnEquipment(startMs, endMs, params.units, params.equipment, params.lab, intervals, params.maintenance)) {
        throw new Error('SLOT_CONFLICT: Slot is no longer available under capacity/maintenance/lab-hour rules.');
      }

      const nextDoc: EquipmentDaySchedule = {
        id: key,
        equipmentId: params.equipment.id,
        date,
        intervals: [
          ...(existing?.intervals ?? []),
          { bookingId: params.bookingId, start: params.start, end: params.end, units: params.units },
        ],
        status: 'active',
        isDemo: params.equipment.isDemo,
        createdAt: existing?.createdAt ?? params.nowIso,
        updatedAt: params.nowIso,
      };
      this.schedules.set(key, nextDoc);
      return structuredClone(nextDoc);
    } finally {
      this.locks.delete(key);
    }
  }

  cancelBooking(equipmentId: string, date: string, bookingId: string, nowIso: string): void {
    const key = `${equipmentId}_${date}`;
    const existing = this.schedules.get(key);
    if (!existing) return;
    this.schedules.set(key, {
      ...existing,
      intervals: existing.intervals.filter((iv) => iv.bookingId !== bookingId),
      updatedAt: nowIso,
    });
  }
}
