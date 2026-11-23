import { describe, expect, it } from 'vitest';
import { createSeedDataset } from '../data/seed';
import {
  computeDeadlineScore,
  computeFairnessScore,
  DEMO_NOW,
  DEMO_SCENARIO_DAY,
  normalizeWeights,
  runAllocationEngine,
  runWhatIf,
  ScheduleStore,
} from './index';

describe('LabLink Deterministic Allocation Engine', () => {
  it('reproduces Section 10 3-student GPU scenario scores, ranks, and slots within 0.1 tolerance', () => {
    const data = createSeedDataset();
    const result = runAllocationEngine(
      {
        requests: data.bookingRequests,
        equipment: data.equipment,
        laboratories: data.laboratories,
        projects: data.projects,
        users: data.users,
        bookings: data.bookings,
        maintenance: data.maintenance,
        usageLogs: data.usageLogs,
        targetEquipmentId: 'gpu-ws-01',
        targetDate: DEMO_SCENARIO_DAY,
      },
      DEMO_NOW
    );

    expect(result.entries).toHaveLength(3);

    const byId = new Map(result.entries.map((e) => [e.requestId, e]));
    const a = byId.get('req-demo-a')!;
    const b = byId.get('req-demo-b')!;
    const c = byId.get('req-demo-c')!;

    expect(a.eligibility).toBe('ELIGIBLE');
    expect(b.eligibility).toBe('ELIGIBLE');
    expect(c.eligibility).toBe('ELIGIBLE');

    // Deadline scores: A=100, C=85, B=50
    expect(a.scoreBreakdown!.deadline.score).toBeCloseTo(100, 1);
    expect(c.scoreBreakdown!.deadline.score).toBeCloseTo(85, 1);
    expect(b.scoreBreakdown!.deadline.score).toBeCloseTo(50, 1);

    // Necessity scores: A=100, C=100, B=80 (Jetson loose alt)
    expect(a.scoreBreakdown!.necessity.score).toBeCloseTo(100, 1);
    expect(c.scoreBreakdown!.necessity.score).toBeCloseTo(100, 1);
    expect(b.scoreBreakdown!.necessity.score).toBeCloseTo(80, 1);

    // Fairness scores: A=40, B=100, C=0
    expect(a.scoreBreakdown!.fairness.score).toBeCloseTo(40, 1);
    expect(b.scoreBreakdown!.fairness.score).toBeCloseTo(100, 1);
    expect(c.scoreBreakdown!.fairness.score).toBeCloseTo(0, 1);
    expect(c.flags).toContain('FAIR_USE_EXCEEDED');

    // Feasibility scores: A=B=C=100 against confirmed bookings only
    expect(a.scoreBreakdown!.feasibility.score).toBeCloseTo(100, 1);
    expect(b.scoreBreakdown!.feasibility.score).toBeCloseTo(100, 1);
    expect(c.scoreBreakdown!.feasibility.score).toBeCloseTo(100, 1);

    // Waiting scores: A=16.7, B=66.7, C=33.3
    expect(a.scoreBreakdown!.waiting.score).toBeCloseTo(16.7, 1);
    expect(b.scoreBreakdown!.waiting.score).toBeCloseTo(66.7, 1);
    expect(c.scoreBreakdown!.waiting.score).toBeCloseTo(33.3, 1);

    // Priority totals: A=83.8, B=75.8, C=71.4
    expect(a.scoreBreakdown!.total).toBeCloseTo(83.8, 1);
    expect(b.scoreBreakdown!.total).toBeCloseTo(75.8, 1);
    expect(c.scoreBreakdown!.total).toBeCloseTo(71.4, 1);

    // Ranks: A=1, B=2, C=3
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(2);
    expect(c.rank).toBe(3);

    // Slots: A=D 11:00-13:00, B=D 13:00-15:00, C=D+1 09:00-12:00
    expect(a.recommendedSlot?.start).toBe('2026-03-03T11:00:00');
    expect(a.recommendedSlot?.end).toBe('2026-03-03T13:00:00');

    expect(b.recommendedSlot?.start).toBe('2026-03-03T13:00:00');
    expect(b.recommendedSlot?.end).toBe('2026-03-03T15:00:00');

    expect(c.recommendedSlot?.start).toBe('2026-03-04T09:00:00');
    expect(c.recommendedSlot?.end).toBe('2026-03-04T12:00:00');
    expect(c.alternatives.sameEquipmentSlots.length).toBeGreaterThan(0);
  });

  it('normalizes arbitrary weights to sum 1 and respects boundary anchors', () => {
    const w = normalizeWeights({ deadline: 0.7, necessity: 0.3, fairness: 0, feasibility: 0, waiting: 0 });
    const sum = w.deadline + w.necessity + w.fairness + w.feasibility + w.waiting;
    expect(sum).toBeCloseTo(1, 5);
    expect(w.deadline).toBeCloseTo(0.7, 5);

    expect(computeDeadlineScore('2026-03-01T09:00:00', DEMO_NOW).isPastDeadline).toBe(true);
    expect(computeDeadlineScore('2026-03-01T09:00:00', DEMO_NOW).score).toBe(100);
    expect(computeDeadlineScore('2026-03-05T09:00:00', DEMO_NOW).score).toBe(70); // 72h
    expect(computeDeadlineScore('2026-03-12T09:00:00', DEMO_NOW).score).toBe(25); // 240h
    expect(computeDeadlineScore('2026-04-01T09:00:00', DEMO_NOW).score).toBe(5); // >=720h

    expect(computeFairnessScore(0, 10)).toEqual({ score: 100, exceeded: false });
    expect(computeFairnessScore(10, 10)).toEqual({ score: 0, exceeded: false });
    expect(computeFairnessScore(15, 10)).toEqual({ score: 0, exceeded: true });
  });

  it('flags all hard constraint failure codes accurately', () => {
    const data = createSeedDataset();
    const baseReq = { ...data.bookingRequests[0], id: 'test-hc' };
    const gpu01 = data.equipment.find((e) => e.id === 'gpu-ws-01')!;

    const runOne = (overrides: Partial<typeof baseReq>, eqOverride?: Partial<typeof gpu01>, projDeadline?: string) => {
      const eqList = data.equipment.map((e) => (e.id === 'gpu-ws-01' && eqOverride ? { ...e, ...eqOverride } : e));
      const projList = data.projects.map((p) =>
        p.id === baseReq.projectId && projDeadline ? { ...p, deadline: projDeadline, deadlineType: 'exact' as const } : p
      );
      const res = runAllocationEngine(
        {
          requests: [{ ...baseReq, ...overrides }],
          equipment: eqList,
          laboratories: data.laboratories,
          projects: projList,
          users: data.users,
          bookings: data.bookings,
          maintenance: data.maintenance,
          usageLogs: data.usageLogs,
          targetEquipmentId: 'gpu-ws-01',
        },
        DEMO_NOW
      );
      return res.entries[0];
    };

    // Inactive
    expect(runOne({}, { isActive: false, status: 'inactive' }).constraintChecks.find((c) => c.code === 'EQUIPMENT_INACTIVE')?.passed).toBe(false);
    // Unavailable
    expect(runOne({}, { quantity: 0 }).constraintChecks.find((c) => c.code === 'EQUIPMENT_UNAVAILABLE')?.passed).toBe(false);
    // Maintenance overlap (15:00-17:00)
    expect(runOne({ requestedStart: '2026-03-03T15:00:00', requestedEnd: '2026-03-03T16:30:00' }).constraintChecks.find((c) => c.code === 'MAINTENANCE_OVERLAP')?.passed).toBe(false);
    // Outside lab hours
    expect(runOne({ requestedStart: '2026-03-03T18:00:00', requestedEnd: '2026-03-03T19:00:00' }).constraintChecks.find((c) => c.code === 'OUTSIDE_LAB_HOURS')?.passed).toBe(false);
    // Overlaps confirmed booking (09:00-11:00)
    expect(runOne({ requestedStart: '2026-03-03T09:30:00', requestedEnd: '2026-03-03T11:30:00' }).constraintChecks.find((c) => c.code === 'OVERLAPS_CONFIRMED_BOOKING')?.passed).toBe(false);
    // Exceeds max duration (>240m)
    expect(runOne({ requestedStart: '2026-03-03T11:00:00', requestedEnd: '2026-03-03T16:00:00' }).constraintChecks.find((c) => c.code === 'EXCEEDS_MAX_DURATION')?.passed).toBe(false);
    // Below min duration (<30m)
    expect(runOne({ requestedStart: '2026-03-03T11:00:00', requestedEnd: '2026-03-03T11:15:00' }).constraintChecks.find((c) => c.code === 'BELOW_MIN_DURATION')?.passed).toBe(false);
    // Invalid time range (end <= start)
    expect(runOne({ requestedStart: '2026-03-03T12:00:00', requestedEnd: '2026-03-03T11:00:00' }).constraintChecks.find((c) => c.code === 'INVALID_TIME_RANGE')?.passed).toBe(false);
    // Spec mismatch (vramGB: 128)
    expect(runOne({ requiredSpecs: { vramGB: 128 } }).constraintChecks.find((c) => c.code === 'SPEC_MISMATCH')?.passed).toBe(false);
    // Access not permitted (requires robotics_arm cert)
    expect(runOne({}, { requiresCertification: true, requiredCertification: 'robotics_arm' }).constraintChecks.find((c) => c.code === 'ACCESS_NOT_PERMITTED')?.passed).toBe(false);
    // Safety restriction (needs_service)
    expect(runOne({}, { condition: 'needs_service' }).constraintChecks.find((c) => c.code === 'SAFETY_RESTRICTION')?.passed).toBe(false);
    // Deadline before slot end
    expect(runOne({ requestedStart: '2026-03-03T11:00:00', requestedEnd: '2026-03-03T13:00:00' }, undefined, '2026-03-03T12:00:00').constraintChecks.find((c) => c.code === 'DEADLINE_BEFORE_SLOT_END')?.passed).toBe(false);
  });

  it('enforces tie-breaks and What-If immutability', () => {
    const data = createSeedDataset();
    const snapshotBefore = JSON.stringify(data.bookingRequests);

    const whatIf = runWhatIf(
      {
        requests: data.bookingRequests,
        equipment: data.equipment,
        laboratories: data.laboratories,
        projects: data.projects,
        users: data.users,
        bookings: data.bookings,
        maintenance: data.maintenance,
        usageLogs: data.usageLogs,
        targetEquipmentId: 'gpu-ws-01',
        targetDate: DEMO_SCENARIO_DAY,
      },
      // Heavy fairness + waiting weight flips B ahead of A
      { deadline: 0.1, necessity: 0.05, fairness: 0.65, feasibility: 0.05, waiting: 0.15 },
      DEMO_NOW
    );

    expect(JSON.stringify(data.bookingRequests)).toBe(snapshotBefore);
    const simB = whatIf.simulated.entries.find((e) => e.requestId === 'req-demo-b')!;
    const simA = whatIf.simulated.entries.find((e) => e.requestId === 'req-demo-a')!;
    expect(simB.rank).toBe(1);
    expect(simA.rank).toBe(2);
    expect(whatIf.diffs.some((d) => d.summary.includes('Rank moves'))).toBe(true);
  });

  it('prevents double booking on simultaneous confirmations and supports capacity > 1 and cancellation release', async () => {
    const data = createSeedDataset();
    const gpu01 = data.equipment.find((e) => e.id === 'gpu-ws-01')!;
    const kit = data.equipment.find((e) => e.id === 'arduino-mega-01')!; // quantity = 8
    const labAi = data.laboratories.find((l) => l.id === gpu01.laboratoryId);
    const labIot = data.laboratories.find((l) => l.id === kit.laboratoryId);

    const store = new ScheduleStore(data.equipmentDaySchedules);

    // Two simultaneous confirmations for the same slot on quantity=1 equipment -> exactly 1 succeeds
    const results = await Promise.allSettled([
      store.confirmBooking({
        bookingId: 'bk-race-1',
        equipment: gpu01,
        lab: labAi,
        maintenance: data.maintenance,
        start: `${DEMO_SCENARIO_DAY}T11:00:00`,
        end: `${DEMO_SCENARIO_DAY}T13:00:00`,
        units: 1,
        nowIso: DEMO_NOW,
      }),
      store.confirmBooking({
        bookingId: 'bk-race-2',
        equipment: gpu01,
        lab: labAi,
        maintenance: data.maintenance,
        start: `${DEMO_SCENARIO_DAY}T11:00:00`,
        end: `${DEMO_SCENARIO_DAY}T13:00:00`,
        units: 1,
        nowIso: DEMO_NOW,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Cancelling the booking frees the slot
    const winnerBookingId = fulfilled[0].status === 'fulfilled'
      ? fulfilled[0].value.intervals.find((iv) => iv.bookingId.startsWith('bk-race-'))!.bookingId
      : '';
    store.cancelBooking(gpu01.id, DEMO_SCENARIO_DAY, winnerBookingId, DEMO_NOW);

    const rebooked = await store.confirmBooking({
      bookingId: 'bk-after-cancel',
      equipment: gpu01,
      lab: labAi,
      maintenance: data.maintenance,
      start: `${DEMO_SCENARIO_DAY}T11:00:00`,
      end: `${DEMO_SCENARIO_DAY}T13:00:00`,
      units: 1,
      nowIso: DEMO_NOW,
    });
    expect(rebooked.intervals.some((iv) => iv.bookingId === 'bk-after-cancel')).toBe(true);

    // Capacity-aware overlap for quantity > 1 (8 units)
    await store.confirmBooking({
      bookingId: 'bk-kit-5',
      equipment: kit,
      lab: labIot,
      maintenance: data.maintenance,
      start: `${DEMO_SCENARIO_DAY}T10:00:00`,
      end: `${DEMO_SCENARIO_DAY}T12:00:00`,
      units: 5,
      nowIso: DEMO_NOW,
    });
    // 5 + 3 = 8 -> allowed
    await store.confirmBooking({
      bookingId: 'bk-kit-3',
      equipment: kit,
      lab: labIot,
      maintenance: data.maintenance,
      start: `${DEMO_SCENARIO_DAY}T11:00:00`,
      end: `${DEMO_SCENARIO_DAY}T13:00:00`,
      units: 3,
      nowIso: DEMO_NOW,
    });
    // 5 + 3 + 1 = 9 > 8 during 11:00-12:00 -> rejected
    await expect(
      store.confirmBooking({
        bookingId: 'bk-kit-overflow',
        equipment: kit,
        lab: labIot,
        maintenance: data.maintenance,
        start: `${DEMO_SCENARIO_DAY}T11:00:00`,
        end: `${DEMO_SCENARIO_DAY}T12:00:00`,
        units: 1,
        nowIso: DEMO_NOW,
      })
    ).rejects.toThrow(/SLOT_CONFLICT/);
  });
});
