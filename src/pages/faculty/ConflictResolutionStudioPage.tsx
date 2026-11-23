import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Play,
  RefreshCw,
  Sliders,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import {
  Button,
  Card,
  EmptyState,
  Input,
  ScoreRing,
  Select,
  SkeletonBlock,
  StatusBadge,
  Stepper,
  Tabs,
  Textarea,
} from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo, TransactionConflictError } from '../../data/repo';
import { runAllocationEngine, runWhatIf } from '../../engine/allocator';
import { DEFAULT_WEIGHTS, DEMO_NOW, DEMO_SCENARIO_DAY, formatLocalIso, parseIsoMs } from '../../engine/constants';
import { normalizeWeights } from '../../engine/scoring';
import type { AllocationRequestResult, AllocationWeights } from '../../types/models';

const PIPELINE_STEPS = [
  { label: 'Load Requests', detail: 'Pending queue' },
  { label: 'Hard Constraints', detail: '12 rule checks' },
  { label: 'Factor Scoring', detail: '5 weighted factors' },
  { label: 'Tie-Break Rank', detail: 'Deterministic order' },
  { label: 'Slot Assignment', detail: 'Sequential lock' },
  { label: 'Alternatives', detail: 'Alt & split search' },
];

export const ConflictResolutionStudioPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { data, pushToast } = useData();

  const [studioTab, setStudioTab] = useState<'studio' | 'whatif'>('studio');
  const [altTab, setAltTab] = useState<'same' | 'altEq' | 'nearby' | 'split' | 'waitlist'>('same');
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>(() => {
    const eq = searchParams.get('eq');
    const date = searchParams.get('date');
    return eq && date ? `${eq}__${date}` : `gpu-ws-01__${DEMO_SCENARIO_DAY}`;
  });
  const [selectedReqId, setSelectedReqId] = useState<string>('req-demo-a');
  const [pipelineStep, setPipelineStep] = useState<number>(6);
  const [runningPipeline, setRunningPipeline] = useState(false);

  // Decision form state
  const [decisionMode, setDecisionMode] = useState<'accept' | 'modify' | 'override' | 'suggest' | 'reject' | 'info'>('accept');
  const [modEquipmentId, setModEquipmentId] = useState('gpu-ws-01');
  const [modStart, setModStart] = useState(`${DEMO_SCENARIO_DAY}T11:00`);
  const [modEnd, setModEnd] = useState(`${DEMO_SCENARIO_DAY}T13:00`);
  const [decisionReason, setDecisionReason] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // Explainability state
  const [explainLoading, setExplainLoading] = useState(false);
  const [explanation, setExplanation] = useState<{
    source: string;
    label: string;
    summary: string;
    perRequest: Array<{ requestId: string; explanation: string }>;
  } | null>(null);

  // What-If Simulator weights
  const allocSettings = data.settings.find((s) => s.id === 'allocation');
  const baseWeights = allocSettings?.weights ?? DEFAULT_WEIGHTS;
  const [simWeights, setSimWeights] = useState<AllocationWeights>({ ...baseWeights });

  // Discover all active pending conflict groups
  const availableGroups = useMemo(() => {
    const map = new Map<string, { key: string; equipmentId: string; date: string; count: number }>();
    for (const r of data.bookingRequests) {
      if (!['submitted', 'pending_approval', 'ai_recommended'].includes(r.status)) continue;
      const d = r.requestedStart.slice(0, 10);
      const key = `${r.equipmentId}__${d}`;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, equipmentId: r.equipmentId, date: d, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [data.bookingRequests]);

  const activeGroup = useMemo(() => {
    return (
      availableGroups.find((g) => g.key === selectedGroupKey) ??
      availableGroups[0] ?? {
        key: `gpu-ws-01__${DEMO_SCENARIO_DAY}`,
        equipmentId: 'gpu-ws-01',
        date: DEMO_SCENARIO_DAY,
        count: 0,
      }
    );
  }, [availableGroups, selectedGroupKey]);

  const refNow = useMemo(() => {
    const groupHasDemo = data.bookingRequests.some(
      (r) => r.equipmentId === activeGroup.equipmentId && r.requestedStart.slice(0, 10) === activeGroup.date && r.isDemo
    );
    return groupHasDemo ? DEMO_NOW : formatLocalIso(Date.now());
  }, [data.bookingRequests, activeGroup]);

  const engineInput = useMemo(
    () => ({
      requests: data.bookingRequests,
      equipment: data.equipment,
      laboratories: data.laboratories,
      projects: data.projects,
      users: data.users,
      bookings: data.bookings,
      maintenance: data.maintenance,
      usageLogs: data.usageLogs,
      weights: baseWeights,
      fairUseLimitHours: allocSettings?.fairUseLimitHours,
      enforceFairUseHard: allocSettings?.enforceFairUseHard,
      targetEquipmentId: activeGroup.equipmentId,
      targetDate: activeGroup.date,
    }),
    [data, baseWeights, allocSettings, activeGroup]
  );

  const allocationResult = useMemo(() => runAllocationEngine(engineInput, refNow), [engineInput, refNow]);
  const whatIfResult = useMemo(() => runWhatIf(engineInput, simWeights, refNow), [engineInput, simWeights, refNow]);

  const selectedEntry: AllocationRequestResult | undefined = useMemo(
    () => allocationResult.entries.find((e) => e.requestId === selectedReqId) ?? allocationResult.entries[0],
    [allocationResult.entries, selectedReqId]
  );

  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);
  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users]);
  const projById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);
  const reqById = useMemo(() => new Map(data.bookingRequests.map((r) => [r.id, r])), [data.bookingRequests]);

  const activeEquipment = eqById.get(activeGroup.equipmentId);

  // Sync modify defaults when selected entry changes
  useEffect(() => {
    if (selectedEntry) {
      const slot = selectedEntry.recommendedSlot;
      const rawReq = reqById.get(selectedEntry.requestId);
      setModEquipmentId(slot?.equipmentId ?? selectedEntry.equipmentId);
      setModStart((slot?.start ?? rawReq?.requestedStart ?? `${activeGroup.date}T11:00:00`).slice(0, 16));
      setModEnd((slot?.end ?? rawReq?.requestedEnd ?? `${activeGroup.date}T13:00:00`).slice(0, 16));
      setTxError(null);
    }
  }, [selectedEntry, reqById, activeGroup.date]);

  const triggerPipelineAnimation = () => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setPipelineStep(6);
      return;
    }
    setRunningPipeline(true);
    setPipelineStep(0);
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      setPipelineStep(step);
      if (step >= 6) {
        clearInterval(timer);
        setRunningPipeline(false);
      }
    }, 220);
  };

  const handleLoadDemoConflict = async () => {
    if (!user) return;
    await repo.loadDemoConflictScenario(user.uid);
    setSelectedGroupKey(`gpu-ws-01__${DEMO_SCENARIO_DAY}`);
    setSelectedReqId('req-demo-a');
    triggerPipelineAnimation();
    pushToast({
      title: 'Demo Conflict Scenario Loaded',
      message: `GPU-WS-01 on ${DEMO_SCENARIO_DAY} (A=83.8, B=75.8, C=71.4).`,
      tone: 'success',
    });
  };

  const fetchExplanation = async () => {
    setExplainLoading(true);
    const studentNames: Record<string, string> = {};
    const projectTitles: Record<string, string> = {};
    allocationResult.entries.forEach((e) => {
      studentNames[e.studentId] = userById.get(e.studentId)?.displayName ?? e.studentId;
      projectTitles[e.projectId] = projById.get(e.projectId)?.title ?? e.projectId;
    });
    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocationResult,
          equipmentName: activeEquipment?.name,
          studentNames,
          projectTitles,
        }),
      });
      const json = await res.json();
      setExplanation(json);
    } catch {
      setExplanation(null);
    } finally {
      setExplainLoading(false);
    }
  };

  useEffect(() => {
    if (allocationResult.entries.length > 0) {
      fetchExplanation();
    } else {
      setExplanation(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocationResult.id, allocationResult.entries.length]);

  const handleDecisionSubmit = async () => {
    if (!user || !selectedEntry) return;
    setTxError(null);

    const isTopRanked = selectedEntry.rank === 1;
    const requiresOverrideReason = decisionMode === 'override' || (!isTopRanked && (decisionMode === 'accept' || decisionMode === 'modify'));

    if (requiresOverrideReason && decisionReason.trim().length < 20) {
      setTxError('Overriding rank #1 or issuing a manual override requires a reason of at least 20 characters.');
      return;
    }

    if ((decisionMode === 'reject' || decisionMode === 'suggest' || decisionMode === 'info') && decisionReason.trim().length < 5) {
      setTxError('Provide a concise note explaining this decision to the student.');
      return;
    }

    setSubmittingDecision(true);
    try {
      if (decisionMode === 'accept' || decisionMode === 'modify' || decisionMode === 'override') {
        const useSlot =
          decisionMode === 'accept' && selectedEntry.recommendedSlot
            ? selectedEntry.recommendedSlot
            : {
                start: `${modStart}:00`,
                end: `${modEnd}:00`,
                equipmentId: modEquipmentId,
                equipmentName: eqById.get(modEquipmentId)?.name,
              };

        await repo.approveBookingRequest({
          requestId: selectedEntry.requestId,
          facultyId: user.uid,
          slot: useSlot,
          equipmentId: useSlot.equipmentId || selectedEntry.equipmentId,
          isOverride: requiresOverrideReason,
          reason: decisionReason.trim() || undefined,
          engineSnapshot: {
            rank: selectedEntry.rank,
            totalScore: selectedEntry.scoreBreakdown?.total ?? 0,
            recommendedSlot: selectedEntry.recommendedSlot,
          },
        });
        await repo.saveAllocationResult(allocationResult, user.uid);
        pushToast({
          title: 'Slot Confirmed via Transaction',
          message: `${userById.get(selectedEntry.studentId)?.displayName ?? 'Student'} booked on ${useSlot.start.slice(11, 16)}–${useSlot.end.slice(11, 16)}.`,
          tone: 'success',
        });
      } else {
        const decMap = {
          reject: 'rejected',
          suggest: 'suggested_alternative',
          info: 'more_info_requested',
        } as const;
        await repo.facultyDecideOther({
          requestId: selectedEntry.requestId,
          facultyId: user.uid,
          decision: decMap[decisionMode],
          reason: decisionReason.trim(),
          isOverride: !isTopRanked,
          suggestedSlot:
            decisionMode === 'suggest' && selectedEntry.alternatives.sameEquipmentSlots[0]
              ? {
                  start: selectedEntry.alternatives.sameEquipmentSlots[0].start,
                  end: selectedEntry.alternatives.sameEquipmentSlots[0].end,
                  equipmentId: selectedEntry.alternatives.sameEquipmentSlots[0].equipmentId,
                }
              : undefined,
          engineSnapshot: {
            rank: selectedEntry.rank,
            totalScore: selectedEntry.scoreBreakdown?.total ?? 0,
            recommendedSlot: selectedEntry.recommendedSlot,
          },
        });
        pushToast({ title: 'Decision Recorded', tone: 'info' });
      }
      setDecisionReason('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed.';
      setTxError(msg);
      if (err instanceof TransactionConflictError) {
        pushToast({ title: 'Double-Booking Prevented', message: msg, tone: 'error' });
      }
    } finally {
      setSubmittingDecision(false);
    }
  };

  // Gantt timeline calculations (09:00 to 18:00 = 540 mins)
  const dayStartMs = parseIsoMs(`${activeGroup.date}T09:00:00`);
  const dayTotalMs = 9 * 3600000;
  const pctForRange = (startIso: string, endIso: string) => {
    const s = Math.max(0, parseIsoMs(startIso) - dayStartMs);
    const e = Math.min(dayTotalMs, parseIsoMs(endIso) - dayStartMs);
    return {
      left: `${(s / dayTotalMs) * 100}%`,
      width: `${Math.max(4, ((e - s) / dayTotalMs) * 100)}%`,
    };
  };

  const dayBookings = data.bookings.filter(
    (b) =>
      b.equipmentId === activeGroup.equipmentId &&
      (b.status === 'approved' || b.status === 'checked_in') &&
      b.start.slice(0, 10) === activeGroup.date
  );
  const dayMaint = data.maintenance.filter(
    (m) =>
      m.equipmentId === activeGroup.equipmentId &&
      m.status !== 'cancelled' &&
      m.status !== 'completed' &&
      m.start.slice(0, 10) <= activeGroup.date &&
      m.end.slice(0, 10) >= activeGroup.date
  );

  const normalizedSim = normalizeWeights(simWeights);

  return (
    <AppShell
      title="Conflict Resolution Studio"
      subtitle="Deterministic 12-constraint validation, weighted fairness ranking, What-If tuning, and transactional approval."
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={handleLoadDemoConflict}>
            <FlaskConical className="h-3.5 w-3.5 text-[#22D3EE]" />
            Load Demo Conflict (3-Student GPU)
          </Button>
          <Button variant="primary" size="sm" onClick={triggerPipelineAnimation} loading={runningPipeline}>
            <Play className="h-3.5 w-3.5" />
            Run Engine
          </Button>
        </>
      }
    >
      {/* Top Pipeline Stepper + Group Selector */}
      <Card padding="sm" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-md flex-1">
            <Select
              label="Active Contention Group (Equipment · Date)"
              value={activeGroup.key}
              onChange={(e) => setSelectedGroupKey(e.target.value)}
            >
              {availableGroups.length === 0 ? (
                <option value={activeGroup.key}>No pending requests — click Load Demo Conflict</option>
              ) : (
                availableGroups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {eqById.get(g.equipmentId)?.equipmentId ?? g.equipmentId} · {g.date} ({g.count} pending)
                  </option>
                ))
              )}
            </Select>
          </div>
          <Tabs
            activeId={studioTab}
            onChange={(id) => setStudioTab(id as 'studio' | 'whatif')}
            items={[
              { id: 'studio', label: 'Allocation Studio' },
              { id: 'whatif', label: 'What-If Weight Simulator' },
            ]}
          />
        </div>

        <Stepper steps={PIPELINE_STEPS} activeIndex={pipelineStep} />
      </Card>

      {allocationResult.entries.length === 0 ? (
        <EmptyState
          icon={<Sliders className="h-6 w-6" />}
          title="No pending requests in selected group"
          description="Select another contention group above or load the reproducible 3-student GPU contention scenario."
          action={<Button onClick={handleLoadDemoConflict}>Load Demo Conflict</Button>}
        />
      ) : studioTab === 'whatif' ? (
        /* What-If Simulator Tab */
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold">Simulated Factor Weights</h2>
                <p className="text-[11px] text-[#FCD34D]">Simulation Only — Does Not Mutate Live Bookings</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSimWeights({ ...DEFAULT_WEIGHTS })}>
                Reset
              </Button>
            </div>

            {(
              [
                ['deadline', 'Deadline Urgency'],
                ['necessity', 'Equipment Necessity'],
                ['fairness', '30d Fairness'],
                ['feasibility', 'Slot Feasibility'],
                ['waiting', 'Waiting Time'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#CBD5E1]">{label}</span>
                  <span className="font-mono text-[#22D3EE] tabular-nums">
                    {Math.round(normalizedSim[key] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(simWeights[key] * 100)}
                  onChange={(e) => setSimWeights((w) => ({ ...w, [key]: Number(e.target.value) / 100 }))}
                  className="w-full accent-[#22D3EE]"
                />
              </div>
            ))}
          </Card>

          <Card className="lg:col-span-8 space-y-4">
            <h2 className="font-display text-base font-semibold">Live Ranking &amp; Slot Diff vs Active Policy</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[#94A3B8]">
                    <th className="py-2 pr-4">Student / Project</th>
                    <th className="py-2 pr-4">Baseline</th>
                    <th className="py-2 pr-4">Simulated</th>
                    <th className="py-2 pr-4">Delta</th>
                    <th className="py-2">Slot Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {whatIfResult.diffs.map((d) => {
                    const req = reqById.get(d.requestId);
                    const student = req ? userById.get(req.studentId) : undefined;
                    return (
                      <tr key={d.requestId}>
                        <td className="py-3 pr-4 font-medium text-[#F8FAFC]">{student?.displayName ?? d.requestId}</td>
                        <td className="py-3 pr-4 font-mono tabular-nums text-[#94A3B8]">
                          #{d.baselineRank ?? '-'} · {d.baselineScore}
                        </td>
                        <td className="py-3 pr-4 font-mono font-semibold tabular-nums text-[#22D3EE]">
                          #{d.simulatedRank ?? '-'} · {d.simulatedScore}
                        </td>
                        <td className="py-3 pr-4 text-[#CBD5E1]">{d.summary}</td>
                        <td className="py-3 font-mono text-[11px] text-[#94A3B8] tabular-nums">
                          {d.simulatedSlot
                            ? `${d.simulatedSlot.start.slice(5, 16).replace('T', ' ')}–${d.simulatedSlot.end.slice(11, 16)}`
                            : 'Waitlist'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        /* 3-Column Conflict Studio */
        <div className="grid gap-5 xl:grid-cols-12">
          {/* LEFT: Ranked Candidates + Stacked Breakdown + 12 Constraints */}
          <div className="xl:col-span-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              Ranked Candidates ({allocationResult.entries.length})
            </h2>

            {allocationResult.entries.map((entry) => {
              const student = userById.get(entry.studentId);
              const project = projById.get(entry.projectId);
              const isSelected = selectedEntry?.requestId === entry.requestId;
              const sb = entry.scoreBreakdown;
              return (
                <button
                  key={entry.requestId}
                  type="button"
                  onClick={() => setSelectedReqId(entry.requestId)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors cursor-pointer space-y-3 ${
                    isSelected
                      ? 'border-[#22D3EE] bg-[#17243A]'
                      : 'border-white/[0.08] bg-[#111B2E] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#22D3EE]">
                          {entry.rank ? `RANK #${entry.rank}` : 'INELIGIBLE'}
                        </span>
                        {entry.flags.includes('FAIR_USE_EXCEEDED') && (
                          <span className="rounded bg-[#F59E0B]/20 px-1.5 py-0.5 font-mono text-[10px] text-[#FCD34D]">
                            &gt;10h Fair-Use Flag
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-[#F8FAFC]">
                        {student?.displayName ?? entry.studentId}
                      </p>
                      <p className="truncate text-xs text-[#94A3B8]">{project?.title ?? entry.projectId}</p>
                    </div>
                    {sb ? <ScoreRing score={sb.total} size={50} /> : <StatusBadge status="ineligible" />}
                  </div>

                  {sb && (
                    <div className="space-y-1.5">
                      {/* Stacked horizontal bar */}
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[#080D19]">
                        <div style={{ width: `${sb.deadline.weighted}%` }} className="bg-[#3B82F6]" title="Deadline" />
                        <div style={{ width: `${sb.necessity.weighted}%` }} className="bg-[#22D3EE]" title="Necessity" />
                        <div style={{ width: `${sb.fairness.weighted}%` }} className="bg-[#10B981]" title="Fairness" />
                        <div style={{ width: `${sb.feasibility.weighted}%` }} className="bg-[#8B5CF6]" title="Feasibility" />
                        <div style={{ width: `${sb.waiting.weighted}%` }} className="bg-[#F59E0B]" title="Waiting" />
                      </div>
                      <div className="grid grid-cols-5 gap-1 font-mono text-[10px] text-[#94A3B8] tabular-nums">
                        <span>D {sb.deadline.weighted}</span>
                        <span>N {sb.necessity.weighted}</span>
                        <span>F {sb.fairness.weighted}</span>
                        <span>S {sb.feasibility.weighted}</span>
                        <span>W {sb.waiting.weighted}</span>
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-[#CBD5E1]">
                    {entry.recommendedSlot
                      ? `Recommended: ${entry.recommendedSlot.start.slice(5, 16).replace('T', ' ')}–${entry.recommendedSlot.end.slice(11, 16)}`
                      : entry.reasons[0]}
                  </div>
                </button>
              );
            })}

            {selectedEntry && (
              <Card padding="sm" className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#F8FAFC]">12-Rule Hard Constraint Matrix</p>
                  <span className="font-mono text-[11px] tabular-nums text-[#6EE7B7]">
                    {selectedEntry.constraintChecks.filter((c) => c.passed).length}/{selectedEntry.constraintChecks.length} passed
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {selectedEntry.constraintChecks.map((c) => (
                    <div
                      key={c.code}
                      title={c.detail}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${
                        c.passed
                          ? 'border-[#10B981]/25 bg-[#10B981]/5 text-[#6EE7B7]'
                          : 'border-[#EF4444]/35 bg-[#EF4444]/10 text-[#FCA5A5]'
                      }`}
                    >
                      {c.passed ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                      <span className="truncate font-mono">{c.code}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* CENTER: Day Gantt Timeline + Factor Details + 5 Alternatives Tabs */}
          <div className="xl:col-span-4 space-y-4">
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#F8FAFC]">
                  Day Schedule Timeline · {activeGroup.date}
                </h2>
                <span className="font-mono text-[11px] text-[#94A3B8]">09:00–18:00</span>
              </div>

              {/* Confirmed + Maintenance Track */}
              <div className="space-y-2 text-[11px]">
                <div className="text-[#94A3B8]">Confirmed &amp; Maintenance Blocks</div>
                <div className="relative h-9 w-full rounded-lg border border-white/10 bg-[#080D19] overflow-hidden">
                  {[33.33, 66.66].map((pct) => (
                    <div
                      key={pct}
                      style={{ left: `${pct}%` }}
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/[0.06]"
                    />
                  ))}
                  {dayBookings.map((b) => {
                    const pos = pctForRange(b.start, b.end);
                    return (
                      <div
                        key={b.id}
                        style={pos}
                        title={`Confirmed: ${b.start.slice(11, 16)}-${b.end.slice(11, 16)}`}
                        className="absolute top-1 bottom-1 rounded bg-[#EF4444]/55 border border-[#EF4444] px-1.5 font-mono text-[10px] leading-7 text-white truncate"
                      >
                        Booked
                      </div>
                    );
                  })}
                  {dayMaint.map((m) => {
                    const pos = pctForRange(
                      m.start.slice(0, 10) === activeGroup.date ? m.start : `${activeGroup.date}T09:00:00`,
                      m.end.slice(0, 10) === activeGroup.date ? m.end : `${activeGroup.date}T18:00:00`
                    );
                    return (
                      <div
                        key={m.id}
                        style={pos}
                        title={`Maintenance: ${m.title}`}
                        className="absolute top-1 bottom-1 rounded bg-[#F59E0B]/45 border border-[#F59E0B] px-1.5 font-mono text-[10px] leading-7 text-[#FDE68A] truncate"
                      >
                        Maint
                      </div>
                    );
                  })}
                </div>

                {/* Recommended Assignments */}
                <div className="text-[#94A3B8] pt-1">Engine Slot Assignments (Same Day)</div>
                <div className="relative h-9 w-full rounded-lg border border-white/10 bg-[#080D19] overflow-hidden">
                  {[33.33, 66.66].map((pct) => (
                    <div
                      key={pct}
                      style={{ left: `${pct}%` }}
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/[0.06]"
                    />
                  ))}
                  {allocationResult.entries
                    .filter((e) => e.recommendedSlot && e.recommendedSlot.start.slice(0, 10) === activeGroup.date)
                    .map((e) => {
                      const pos = pctForRange(e.recommendedSlot!.start, e.recommendedSlot!.end);
                      const isActiveSlot = selectedEntry?.requestId === e.requestId;
                      return (
                        <div
                          key={e.requestId}
                          style={pos}
                          className={`absolute top-1 bottom-1 rounded border px-1.5 font-mono text-[10px] leading-7 text-[#F8FAFC] truncate transition-colors ${
                            isActiveSlot
                              ? 'bg-[#22D3EE]/50 border-[#22D3EE]'
                              : 'bg-[#3B82F6]/30 border-[#3B82F6]/70'
                          }`}
                        >
                          #{e.rank} {userById.get(e.studentId)?.displayName.split(' ')[0]}
                        </div>
                      );
                    })}
                </div>
                <div className="flex justify-between font-mono text-[10px] tabular-nums text-[#64748B]">
                  <span>09:00</span>
                  <span>12:00</span>
                  <span>15:00</span>
                  <span>18:00</span>
                </div>
              </div>
            </Card>

            {selectedEntry?.scoreBreakdown && (
              <Card className="space-y-2.5">
                <h3 className="text-sm font-semibold text-[#F8FAFC]">Exact Score Breakdown</h3>
                <div className="space-y-1.5 text-xs">
                  {(
                    [
                      ['Deadline Urgency', selectedEntry.scoreBreakdown.deadline],
                      ['Equipment Necessity', selectedEntry.scoreBreakdown.necessity],
                      ['Fairness (30d)', selectedEntry.scoreBreakdown.fairness],
                      ['Slot Feasibility', selectedEntry.scoreBreakdown.feasibility],
                      ['Waiting Time', selectedEntry.scoreBreakdown.waiting],
                    ] as const
                  ).map(([lbl, factor]) => (
                    <div key={lbl} className="flex items-center justify-between gap-3 rounded bg-[#0D1424] px-2.5 py-1.5">
                      <div className="min-w-0">
                        <span className="font-medium text-[#F8FAFC]">{lbl}</span>
                        <span className="ml-2 text-[11px] text-[#64748B]">({factor.rawInput})</span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-[#22D3EE]">
                        {factor.score} × {Math.round(factor.weight * 100)}% = <strong>{factor.weighted}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {selectedEntry && (
              <Card className="space-y-3">
                <h3 className="text-sm font-semibold text-[#F8FAFC]">Deterministic Alternatives</h3>
                <Tabs
                  activeId={altTab}
                  onChange={(id) => setAltTab(id as typeof altTab)}
                  items={[
                    { id: 'same', label: 'Same Eq', count: selectedEntry.alternatives.sameEquipmentSlots.length },
                    { id: 'altEq', label: 'Alt Eq', count: selectedEntry.alternatives.alternativeEquipment.length },
                    { id: 'nearby', label: 'Nearby', count: selectedEntry.alternatives.nearbyLabs.length },
                    { id: 'split', label: 'Split', count: selectedEntry.alternatives.splitOptions.length },
                    { id: 'waitlist', label: 'Waitlist' },
                  ]}
                />

                <div className="space-y-2 text-xs">
                  {altTab === 'same' &&
                    (selectedEntry.alternatives.sameEquipmentSlots.length === 0 ? (
                      <p className="text-[#64748B]">No additional free windows found within deadline.</p>
                    ) : (
                      selectedEntry.alternatives.sameEquipmentSlots.map((s, idx) => (
                        <div key={idx} className="rounded bg-[#0D1424] p-2.5">
                          <p className="font-mono font-semibold text-[#22D3EE] tabular-nums">
                            {s.start.slice(0, 16).replace('T', ' ')}–{s.end.slice(11, 16)}
                          </p>
                          <p className="mt-0.5 text-[#94A3B8]">{s.reason}</p>
                        </div>
                      ))
                    ))}

                  {altTab === 'altEq' &&
                    (selectedEntry.alternatives.alternativeEquipment.length === 0 ? (
                      <p className="text-[#64748B]">No compatible alternative hardware meets specs.</p>
                    ) : (
                      selectedEntry.alternatives.alternativeEquipment.map((a) => (
                        <div key={a.equipmentId} className="rounded bg-[#0D1424] p-2.5">
                          <p className="font-semibold text-[#F8FAFC]">
                            {a.equipmentCode} · {a.name}
                          </p>
                          <p className="font-mono text-[11px] text-[#22D3EE] tabular-nums">
                            {a.start.slice(0, 16).replace('T', ' ')}–{a.end.slice(11, 16)} · Spec match {a.specMatchScore}%
                          </p>
                          <p className="mt-0.5 text-[#94A3B8]">{a.reason}</p>
                        </div>
                      ))
                    ))}

                  {altTab === 'nearby' &&
                    (selectedEntry.alternatives.nearbyLabs.length === 0 ? (
                      <p className="text-[#64748B]">No cross-department or same-building slots found.</p>
                    ) : (
                      selectedEntry.alternatives.nearbyLabs.map((n) => (
                        <div key={n.equipmentId} className="rounded bg-[#0D1424] p-2.5">
                          <p className="font-semibold text-[#F8FAFC]">
                            {n.building} · {n.laboratoryName} ({n.equipmentCode})
                          </p>
                          <p className="mt-0.5 text-[#94A3B8]">{n.reason}</p>
                        </div>
                      ))
                    ))}

                  {altTab === 'split' &&
                    (selectedEntry.alternatives.splitOptions.length === 0 ? (
                      <p className="text-[#64748B]">Split-session option unavailable.</p>
                    ) : (
                      selectedEntry.alternatives.splitOptions.map((sp, i) => (
                        <div key={i} className="rounded bg-[#0D1424] p-2.5 space-y-1">
                          <p className="font-semibold text-[#22D3EE]">{sp.reason}</p>
                          {sp.segments.map((seg, j) => (
                            <p key={j} className="font-mono text-[11px] text-[#CBD5E1] tabular-nums">
                              Block {j + 1}: {seg.start.slice(0, 16).replace('T', ' ')}–{seg.end.slice(11, 16)}
                            </p>
                          ))}
                        </div>
                      ))
                    ))}

                  {altTab === 'waitlist' && (
                    <div className="rounded bg-[#0D1424] p-3">
                      <p className="font-semibold text-[#F8FAFC]">
                        Fairness Rank Score: {selectedEntry.alternatives.waitlistEligible.fairnessScore}/100
                      </p>
                      <p className="mt-1 text-[#94A3B8]">{selectedEntry.alternatives.waitlistEligible.reason}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* RIGHT: Grounded Gemini Explanation + Transactional Decision Bar */}
          <div className="xl:col-span-4 space-y-4">
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#22D3EE]">
                  <Sparkles className="h-4 w-4" />
                  <span>{explanation?.label ?? 'Explainable Allocation Rationale'}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={fetchExplanation} loading={explainLoading}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>

              {explainLoading ? (
                <div className="space-y-2">
                  <SkeletonBlock className="h-16 w-full" />
                  <SkeletonBlock className="h-10 w-5/6" />
                </div>
              ) : explanation ? (
                <div className="space-y-2.5 text-xs">
                  <p className="rounded-lg border border-white/[0.06] bg-[#0D1424] p-3 leading-relaxed text-[#CBD5E1]">
                    {explanation.summary}
                  </p>
                  {selectedEntry && (
                    <p className="text-[#94A3B8]">
                      {explanation.perRequest.find((p) => p.requestId === selectedEntry.requestId)?.explanation}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#64748B]">Click refresh to generate grounded allocation rationale.</p>
              )}
            </Card>

            {selectedEntry && (
              <Card className="space-y-3 border-[#3B82F6]/30">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-semibold">Faculty Decision</h3>
                  <span className="font-mono text-xs text-[#22D3EE]">
                    {userById.get(selectedEntry.studentId)?.displayName}
                  </span>
                </div>

                <Select
                  label="Action"
                  value={decisionMode}
                  onChange={(e) => setDecisionMode(e.target.value as typeof decisionMode)}
                >
                  <option value="accept">Accept Recommended Slot (Transactional)</option>
                  <option value="modify">Modify Slot / Equipment &amp; Approve</option>
                  <option value="override">Override Priority Rank &amp; Approve</option>
                  <option value="suggest">Suggest Alternative Slot</option>
                  <option value="info">Request More Information</option>
                  <option value="reject">Reject Request</option>
                </Select>

                {(decisionMode === 'modify' || decisionMode === 'override') && (
                  <div className="space-y-2.5 rounded-lg border border-white/10 bg-[#0D1424] p-3">
                    <Select label="Equipment" value={modEquipmentId} onChange={(e) => setModEquipmentId(e.target.value)}>
                      {data.equipment.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.equipmentId} — {eq.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Start Time"
                      type="datetime-local"
                      value={modStart}
                      onChange={(e) => setModStart(e.target.value)}
                    />
                    <Input
                      label="End Time"
                      type="datetime-local"
                      value={modEnd}
                      onChange={(e) => setModEnd(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Textarea
                    label={
                      decisionMode === 'override' || (selectedEntry.rank !== 1 && (decisionMode === 'accept' || decisionMode === 'modify'))
                        ? 'Audit Override Justification (min 20 characters)'
                        : 'Decision Note'
                    }
                    rows={3}
                    placeholder="Recorded immutably in approvals and auditLogs..."
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                  />
                  {(decisionMode === 'override' || (selectedEntry.rank !== 1 && (decisionMode === 'accept' || decisionMode === 'modify'))) && (
                    <div className="flex justify-end font-mono text-[10px] tabular-nums text-[#94A3B8]">
                      <span className={decisionReason.trim().length >= 20 ? 'text-[#6EE7B7]' : 'text-[#FCD34D]'}>
                        {decisionReason.trim().length}/20 chars
                      </span>
                    </div>
                  )}
                </div>

                {txError && (
                  <div className="flex items-start gap-2 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 p-2.5 text-xs text-[#FCA5A5]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{txError}</span>
                  </div>
                )}

                <Button
                  variant={decisionMode === 'reject' ? 'danger' : 'primary'}
                  size="lg"
                  className="w-full"
                  loading={submittingDecision}
                  onClick={handleDecisionSubmit}
                >
                  Confirm &amp; Persist Decision
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
};
