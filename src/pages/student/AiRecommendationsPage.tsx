import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Compass,
  FolderKanban,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { AppImage, resolveEquipmentImage } from '../../components/ui/AppImage';
import { Button, GlassPanel, Select, SkeletonBlock, StatusBadge } from '../../components/ui/Primitives';
import { getDepartmentTheme } from '../../config/departmentThemes';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { runAllocationEngine } from '../../engine/allocator';
import { DEMO_NOW, DEMO_SCENARIO_DAY, formatLocalIso, toDateKey } from '../../engine/constants';
import type { Equipment, EquipmentDaySchedule, Laboratory } from '../../types/models';

interface MatchedEquipmentSummary {
  id: string;
  equipmentId: string;
  name: string;
  category: string;
  building: string;
  available: boolean;
  specs: Record<string, string | number | boolean | undefined>;
}

interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sourceLabel?: string;
  citedEquipmentIds?: string[];
  matchedSnapshot?: MatchedEquipmentSummary[];
  detectedTokens?: string[];
  whyMatch?: string[];
}

const PROMPT_GRID: Array<{ title: string; category: string; prompt: string }> = [
  {
    title: 'CUDA GPU >= 16GB',
    category: 'GPU Workstation',
    prompt: 'Which CUDA GPU equipment with >= 16GB VRAM is operational right now?',
  },
  {
    title: 'Request Ranking & Slots',
    category: 'Allocation AI',
    prompt: 'Why is my booking request ranked where it is and what alternatives exist?',
  },
  {
    title: 'Robotics & 3D Printers',
    category: 'Cross-Dept',
    prompt: 'Find robotics or 3D printing equipment available in neighboring buildings.',
  },
  {
    title: 'FPGA Synthesis Rig',
    category: 'FPGA & Hardware',
    prompt: 'Show operational FPGA boards or hardware synthesis benches with lab hours.',
  },
  {
    title: 'Oscilloscope & Test',
    category: 'Electronics & Test',
    prompt: 'Which digital oscilloscopes or PCB test instruments are free for debugging?',
  },
  {
    title: 'CNC & Fabrication',
    category: 'Mechanical',
    prompt: 'Find CNC milling or precision manufacturing equipment and safety rules.',
  },
  {
    title: 'Edge AI & LiDAR',
    category: 'Embedded & IoT',
    prompt: 'List Jetson or LiDAR sensor kits available for autonomous perception testing.',
  },
  {
    title: 'Network & RF Lab',
    category: 'Networking',
    prompt: 'Which programmable network switches or SDR lab setups are active today?',
  },
  {
    title: 'Quick 2-Hour Window',
    category: 'Availability',
    prompt: 'Show operational instruments with open windows today across any department.',
  },
];

function computeNextFreeWindow(
  eq: Equipment,
  lab: Laboratory | undefined,
  schedules: EquipmentDaySchedule[],
  dayKey: string
): string {
  if (!eq.isActive || eq.maintenanceStatus === 'under_maintenance') return 'Unavailable';
  const openH = Number((lab?.openHour ?? '09:00').slice(0, 2));
  const closeH = Number((lab?.closeHour ?? '18:00').slice(0, 2));
  const daySched = schedules.find((s) => s.equipmentId === eq.id && s.date === dayKey);
  const intervals = daySched?.intervals ?? [];

  for (let h = openH; h < closeH; h++) {
    const startMin = h * 60;
    const endMin = (h + 1) * 60;
    const usedUnits = intervals
      .filter((iv) => {
        const ivS = Number(iv.start.slice(0, 2)) * 60 + Number(iv.start.slice(3, 5));
        const ivE = Number(iv.end.slice(0, 2)) * 60 + Number(iv.end.slice(3, 5));
        return ivS < endMin && ivE > startMin;
      })
      .reduce((sum, iv) => sum + (iv.units || 1), 0);
    if (usedUnits < Math.max(1, eq.quantity)) {
      return `${dayKey} ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`;
    }
  }
  return 'Check next lab day';
}

export const AiRecommendationsPage: React.FC = () => {
  const { user } = useAuth();
  const { data, geminiStatus } = useData();
  const [searchParams, setSearchParams] = useSearchParams();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(0);
  const [projectFilterId, setProjectFilterId] = useState('');
  const [deptFilterId, setDeptFilterId] = useState('');
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [expandedWhy, setExpandedWhy] = useState<Record<string, boolean>>({});
  const [turns, setTurns] = useState<AssistantTurn[]>([]);

  const handledInitialParam = useRef(false);

  const myProjects = useMemo(
    () => (user ? data.projects.filter((p) => p.ownerId === user.uid && p.status === 'active') : []),
    [data.projects, user]
  );

  const selectedProject = myProjects.find((p) => p.id === projectFilterId);
  const targetDay = user?.isDemo ? DEMO_SCENARIO_DAY : toDateKey(Date.now());

  const allocSnapshot = useMemo(() => {
    const nowIso = user?.isDemo ? DEMO_NOW : formatLocalIso(Date.now());
    const allocSet = data.settings.find((s) => s.id === 'allocation');
    return runAllocationEngine(
      {
        requests: data.bookingRequests,
        equipment: data.equipment,
        laboratories: data.laboratories,
        projects: data.projects,
        users: data.users,
        bookings: data.bookings,
        maintenance: data.maintenance,
        usageLogs: data.usageLogs,
        weights: allocSet?.weights,
        fairUseLimitHours: allocSet?.fairUseLimitHours,
        enforceFairUseHard: allocSet?.enforceFairUseHard,
      },
      nowIso
    );
  }, [data, user]);

  useEffect(() => {
    if (!loading) return;
    setPipelineStage(0);
    const t1 = window.setTimeout(() => setPipelineStage(1), 220);
    const t2 = window.setTimeout(() => setPipelineStage(2), 480);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [loading]);

  const askAssistant = async (question: string) => {
    const q = question.trim();
    if (!q || !user || loading) return;

    const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
    const projectTokens = selectedProject
      ? `${selectedProject.title} ${selectedProject.category}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)
      : [];
    const combinedTokens = Array.from(new Set([...tokens, ...projectTokens]));

    const matchedEquipment: MatchedEquipmentSummary[] = data.equipment
      .filter((eq) => {
        if (deptFilterId && eq.departmentId !== deptFilterId) return false;
        const hay = `${eq.equipmentId} ${eq.name} ${eq.category} ${eq.description} ${eq.building} ${JSON.stringify(eq.specs)}`.toLowerCase();
        if (combinedTokens.some((t) => hay.includes(t))) return true;
        return q.toLowerCase().includes('all') || q.toLowerCase().includes('available') || q.toLowerCase().includes('open');
      })
      .slice(0, 6)
      .map((eq) => ({
        id: eq.id,
        equipmentId: eq.equipmentId,
        name: eq.name,
        category: eq.category,
        building: eq.building,
        available: eq.isActive && eq.maintenanceStatus !== 'under_maintenance',
        specs: eq.specs,
      }));

    const userEntries = allocSnapshot.entries.filter((e) => e.studentId === user.uid);
    const userRequests = data.bookingRequests
      .filter((r) => r.studentId === user.uid)
      .map((r) => {
        const entry = userEntries.find((e) => e.requestId === r.id);
        return {
          id: r.id,
          equipmentId: r.equipmentId,
          status: r.status,
          aiScore: entry?.scoreBreakdown?.total ?? r.aiScore,
          reason: entry?.reasons[0] ?? r.facultyNote,
        };
      });

    const alternativeSlots = userEntries
      .flatMap((e) => [
        ...e.alternatives.sameEquipmentSlots.map((s) => ({
          equipmentId: s.equipmentId,
          start: s.start,
          end: s.end,
          reason: s.reason,
        })),
        ...e.alternatives.alternativeEquipment.map((a) => ({
          equipmentId: a.equipmentCode,
          start: a.start,
          end: a.end,
          reason: a.reason,
        })),
      ])
      .slice(0, 6);

    const detectedChips = Array.from(
      new Set([
        ...tokens.filter((t) => ['cuda', 'gpu', 'vram', 'fpga', 'lidar', 'cnc', '3d', 'robotics', 'jetson', 'oscilloscope', 'iot'].includes(t)),
        ...(deptFilterId ? [data.departments.find((d) => d.id === deptFilterId)?.code ?? deptFilterId] : []),
        ...(selectedProject ? [selectedProject.category] : []),
      ])
    ).slice(0, 6);

    setTurns((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text: q }]);
    setRecentQueries((prev) => [q, ...prev.filter((item) => item !== q)].slice(0, 5));
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          retrievedContext: { matchedEquipment, userRequests, alternativeSlots },
        }),
      });
      const json = await res.json();
      const citedIds: string[] = Array.isArray(json.citedIds) && json.citedIds.length > 0
        ? json.citedIds
        : matchedEquipment.map((m) => m.equipmentId);

      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: json.reply || 'No response available from grounded records.',
          sourceLabel: json.label || 'Grounded Campus Retrieval',
          citedEquipmentIds: citedIds,
          matchedSnapshot: matchedEquipment,
          detectedTokens: detectedChips,
          whyMatch: alternativeSlots.map((s) => `${s.equipmentId}: ${s.start.slice(11, 16)}–${s.end.slice(11, 16)} (${s.reason})`),
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          sourceLabel: 'Offline repository retrieval',
          text: `Found ${matchedEquipment.length} matching asset(s) in stored inventory: ${matchedEquipment.map((m) => `${m.name} (${m.equipmentId})`).join(', ') || 'none'}.`,
          citedEquipmentIds: matchedEquipment.map((m) => m.equipmentId),
          matchedSnapshot: matchedEquipment,
          detectedTokens: detectedChips,
          whyMatch: alternativeSlots.map((s) => `${s.equipmentId}: ${s.start.slice(11, 16)}–${s.end.slice(11, 16)} (${s.reason})`),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialQ = searchParams.get('q');
    if (initialQ && !handledInitialParam.current && user) {
      handledInitialParam.current = true;
      void askAssistant(initialQ);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  const hasConversation = turns.length > 0;
  const latestAssistantTurn = [...turns].reverse().find((t) => t.role === 'assistant');

  const userEntries = useMemo(
    () => (user ? allocSnapshot.entries.filter((e) => e.studentId === user.uid) : []),
    [allocSnapshot.entries, user]
  );

  const labById = useMemo(() => new Map(data.laboratories.map((l) => [l.id, l])), [data.laboratories]);
  const deptById = useMemo(() => new Map(data.departments.map((d) => [d.id, d])), [data.departments]);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void askAssistant(input);
    }
  };

  const resetSession = () => {
    setTurns([]);
    setInput('');
  };

  return (
    <AppShell
      title="AI Command Center"
      subtitle="Natural-language hardware discovery, constraint explanation, and slot synthesis grounded in live campus inventory."
      tier="B"
      backdropImageSlot="campus/dusk-wide"
      actions={
        hasConversation ? (
          <Button variant="secondary" size="sm" onClick={resetSession}>
            <RotateCcw className="h-3.5 w-3.5" />
            New Query
          </Button>
        ) : undefined
      }
    >
      {!hasConversation ? (
        /* Centered Hero Command Experience */
        <div className="mx-auto max-w-4xl space-y-8 py-4 sm:py-8">
          <div className="flex flex-col items-center text-center space-y-4">
            {/* CSS Breathing Neural Orb */}
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div
                aria-hidden="true"
                className="ll-orb-breathe absolute inset-0 rounded-full bg-gradient-to-tr from-[#3B82F6]/35 via-[#22D3EE]/30 to-[#8B5CF6]/35 blur-md"
              />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[#22D3EE]/40 bg-[#0B1220]/90 shadow-[0_0_28px_rgba(34,211,238,0.22)]">
                <Sparkles className="h-7 w-7 text-[#22D3EE]" />
              </div>
            </div>

            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-widest text-[#22D3EE]">
                Grounded Resource Intelligence
              </p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#F8FAFC]">
                What do you want to build today?
              </h2>
              <p className="text-sm text-[#94A3B8]">
                Describe your experiment, GPU VRAM needs, safety certification, or schedule constraint. Responses cite
                only verified records and deterministic allocation slots.
              </p>
            </div>
          </div>

          {/* 64px Glass Prompt Bar + Context Filters */}
          <GlassPanel padding="sm" className="space-y-3 border-[#3B82F6]/30 shadow-[0_16px_48px_rgba(2,6,23,0.5)]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void askAssistant(input);
              }}
              className="flex items-center gap-3 min-h-[52px]"
            >
              <Sparkles className="ml-2 h-5 w-5 shrink-0 text-[#22D3EE]" />
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Ask about CUDA GPUs >= 24GB, FPGA rigs, 3D printers, or your booking priority..."
                className="min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-sm sm:text-base text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none"
              />
              <Button type="submit" size="lg" loading={loading} disabled={!input.trim()}>
                <Send className="h-4 w-4" />
                Run Query
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-3">
              <div className="flex items-center gap-2 min-w-[200px] flex-1">
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                <select
                  aria-label="Project context"
                  value={projectFilterId}
                  onChange={(e) => setProjectFilterId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0B1220] px-2.5 py-1.5 text-xs text-[#F8FAFC] focus:border-[#3B82F6] focus:outline-none"
                >
                  <option value="">All Academic Projects (Optional context)</option>
                  {myProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (Due {p.deadline.slice(0, 10)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 min-w-[180px]">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                <select
                  aria-label="Department filter"
                  value={deptFilterId}
                  onChange={(e) => setDeptFilterId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0B1220] px-2.5 py-1.5 text-xs text-[#F8FAFC] focus:border-[#3B82F6] focus:outline-none"
                >
                  <option value="">All Campus Departments</option>
                  {data.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <span className="ml-auto text-[11px] text-[#64748B]">
                Enter to send · Shift+Enter for newline
              </span>
            </div>
          </GlassPanel>

          {recentQueries.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">Recent:</span>
              {recentQueries.map((rq) => (
                <button
                  key={rq}
                  type="button"
                  onClick={() => void askAssistant(rq)}
                  className="rounded-lg border border-white/10 bg-[#111B2E]/90 px-2.5 py-1 text-xs text-[#CBD5E1] hover:border-[#22D3EE]/40 hover:text-[#F8FAFC] cursor-pointer truncate max-w-[260px]"
                >
                  {rq}
                </button>
              ))}
            </div>
          )}

          {/* 3x3 Prompt Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                Grounded Command Presets
              </h3>
              <span className="text-[11px] text-[#64748B]">
                Engine: {geminiStatus === 'configured' ? 'Gemini + Inventory Retrieval' : 'Local Deterministic Retrieval'}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PROMPT_GRID.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => void askAssistant(item.prompt)}
                  className="group flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#111B2E]/85 p-4 text-left transition-all hover:border-[#22D3EE]/45 hover:bg-[#17243A] cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[#22D3EE]">{item.category}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-[#64748B] transition-transform group-hover:translate-x-0.5 group-hover:text-[#22D3EE]" />
                    </div>
                    <p className="mt-1 font-display text-sm font-semibold text-[#F8FAFC]">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#94A3B8] line-clamp-2">{item.prompt}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Active 2-Pane Grounded Command Stream */
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Result & Recommendation Stream */}
          <div className="lg:col-span-8 space-y-4">
            <GlassPanel padding="md" className="space-y-4">
              <div className="space-y-4">
                {turns.map((t) => {
                  const matchedCards = (t.citedEquipmentIds ?? [])
                    .map((cid) => data.equipment.find((e) => e.equipmentId === cid || e.id === cid))
                    .filter((e): e is Equipment => Boolean(e));

                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border p-4 text-sm ${
                        t.role === 'user'
                          ? 'ml-4 sm:ml-12 border-[#3B82F6]/35 bg-[#17243A] text-[#F8FAFC]'
                          : 'border-white/[0.08] bg-[#0B1220]/90 text-[#CBD5E1]'
                      }`}
                    >
                      {t.sourceLabel && (
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#22D3EE]">
                            <Sparkles className="h-3.5 w-3.5" />
                            {t.sourceLabel}
                          </span>
                          {t.detectedTokens && t.detectedTokens.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {t.detectedTokens.map((tok) => (
                                <span
                                  key={tok}
                                  className="rounded border border-white/10 bg-[#111B2E] px-1.5 py-0.5 font-mono text-[10px] text-[#94A3B8]"
                                >
                                  {tok}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <p className="whitespace-pre-line leading-relaxed">{t.text}</p>

                      {matchedCards.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {matchedCards.map((eq) => {
                            const lab = labById.get(eq.laboratoryId);
                            const dept = deptById.get(eq.departmentId);
                            const deptTheme = getDepartmentTheme(eq.departmentId);
                            const img = resolveEquipmentImage(eq);
                            const nextSlot = computeNextFreeWindow(eq, lab, data.equipmentDaySchedules, targetDay);
                            const isWhyOpen = Boolean(expandedWhy[`${t.id}-${eq.id}`]);
                            const specs = Object.entries(eq.specs)
                              .filter(([, v]) => v !== undefined && v !== false)
                              .slice(0, 3);

                            return (
                              <div
                                key={eq.id}
                                className="flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#111B2E]"
                                style={{ borderTopWidth: '2px', borderTopColor: deptTheme.accent }}
                              >
                                <div className="flex gap-3 p-3">
                                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-[#070B14]">
                                    <AppImage
                                      src={img.src}
                                      focalPoint={img.focalPoint}
                                      alt={eq.name}
                                      category={eq.category}
                                      departmentId={eq.departmentId}
                                      className="h-full w-full"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1.5">
                                      <span className="font-mono text-[10px] text-[#22D3EE]">{eq.equipmentId}</span>
                                      <StatusBadge status={!eq.isActive ? 'inactive' : eq.maintenanceStatus} />
                                    </div>
                                    <p className="mt-0.5 truncate font-display text-sm font-semibold text-[#F8FAFC]">
                                      {eq.name}
                                    </p>
                                    <p className="truncate text-[11px] text-[#94A3B8]">
                                      {dept?.code ?? eq.departmentId} · {lab?.name ?? eq.building}
                                    </p>
                                  </div>
                                </div>

                                <div className="px-3 pb-3 space-y-2.5 text-xs">
                                  <div className="flex flex-wrap gap-1">
                                    {specs.map(([k, v]) => (
                                      <span
                                        key={k}
                                        className="rounded border border-white/[0.08] bg-[#0B1220] px-1.5 py-0.5 font-mono text-[10px] text-[#CBD5E1]"
                                      >
                                        {typeof v === 'boolean' ? k.toUpperCase() : `${k}: ${v}`}
                                      </span>
                                    ))}
                                  </div>

                                  <div className="flex items-center gap-1.5 text-[11px] text-[#CBD5E1]">
                                    <CalendarClock className="h-3.5 w-3.5 text-[#22D3EE] shrink-0" />
                                    <span className="truncate">Next open window: {nextSlot}</span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedWhy((prev) => ({
                                        ...prev,
                                        [`${t.id}-${eq.id}`]: !prev[`${t.id}-${eq.id}`],
                                      }))
                                    }
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                                  >
                                    {isWhyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    Why this match
                                  </button>

                                  {isWhyOpen && (
                                    <div className="rounded-lg border border-white/[0.06] bg-[#0B1220] p-2 text-[11px] text-[#94A3B8] space-y-1">
                                      <p>
                                        Category <strong className="text-[#F8FAFC]">{eq.category}</strong> · Session cap{' '}
                                        {eq.minBookingMins}–{eq.maxBookingMins}m · {eq.quantity} unit(s)
                                      </p>
                                      {eq.requiresCertification && (
                                        <p className="text-[#FCD34D]">
                                          Requires {eq.requiredCertification ?? 'lab'} certification
                                        </p>
                                      )}
                                      {t.whyMatch && t.whyMatch.length > 0 && (
                                        <p className="text-[#67E8F9]">Engine slots: {t.whyMatch.slice(0, 2).join(' · ')}</p>
                                      )}
                                    </div>
                                  )}

                                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    <Link to={`/student/equipment/${eq.id}`} className="flex-1">
                                      <Button size="sm" variant="primary" className="w-full">
                                        Request Booking
                                      </Button>
                                    </Link>
                                    <Link to={`/student/campus?equipment=${eq.id}`} title="Locate on 3D Campus">
                                      <Button size="sm" variant="secondary">
                                        <Compass className="h-3.5 w-3.5" />
                                      </Button>
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {loading && (
                  <div className="rounded-xl border border-[#22D3EE]/25 bg-[#0B1220] p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#22D3EE]">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                      <span>
                        {pipelineStage === 0
                          ? 'Parsing specs and project context...'
                          : pipelineStage === 1
                            ? 'Scanning campus inventory & day schedules...'
                            : 'Synthesizing grounded recommendation...'}
                      </span>
                    </div>
                    <SkeletonBlock className="h-4 w-5/6" />
                    <SkeletonBlock className="h-4 w-2/3" />
                  </div>
                )}
              </div>

              {/* Follow-up Prompt Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void askAssistant(input);
                }}
                className="flex items-center gap-2 border-t border-white/[0.08] pt-3"
              >
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Ask a follow-up about specs, labs, or alternative slots..."
                  className="min-h-[40px] flex-1 resize-none rounded-lg border border-white/10 bg-[#0B1220] px-3 py-2 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#22D3EE] focus:outline-none"
                />
                <Button type="submit" loading={loading} disabled={!input.trim()}>
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </form>
            </GlassPanel>
          </div>

          {/* Right: Parsed Context & Grounding Panel */}
          <div className="lg:col-span-4 space-y-4">
            <GlassPanel padding="md" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-[#F8FAFC]">Parsed Context &amp; Filters</h3>
                <span className="text-[11px] font-mono text-[#22D3EE]">
                  {geminiStatus === 'configured' ? 'Gemini + Rules' : 'Rules Grounded'}
                </span>
              </div>

              <div className="space-y-2.5">
                <Select
                  label="Project Deadline Context"
                  value={projectFilterId}
                  onChange={(e) => setProjectFilterId(e.target.value)}
                >
                  <option value="">None selected</option>
                  {myProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (Due {p.deadline.slice(0, 10)})
                    </option>
                  ))}
                </Select>

                <Select
                  label="Department Scope"
                  value={deptFilterId}
                  onChange={(e) => setDeptFilterId(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {data.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedProject && (
                <div className="rounded-lg border border-[#3B82F6]/30 bg-[#0B1220] p-3 text-xs space-y-1">
                  <p className="font-semibold text-[#F8FAFC]">{selectedProject.title}</p>
                  <p className="text-[#94A3B8]">
                    Due {selectedProject.deadline.slice(0, 10)} · {selectedProject.category}
                  </p>
                </div>
              )}

              {latestAssistantTurn?.detectedTokens && latestAssistantTurn.detectedTokens.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                    Detected Query Terms
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {latestAssistantTurn.detectedTokens.map((tok) => (
                      <span
                        key={tok}
                        className="rounded-md border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-2 py-0.5 font-mono text-[11px] text-[#67E8F9]"
                      >
                        {tok}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {userEntries.length > 0 && (
                <div className="space-y-2 border-t border-white/[0.08] pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                    Your Active Engine Scores
                  </p>
                  {userEntries.slice(0, 3).map((entry) => {
                    const eq = data.equipment.find((e) => e.id === entry.equipmentId);
                    return (
                      <div
                        key={entry.requestId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#0B1220] px-2.5 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#F8FAFC]">{eq?.name ?? entry.equipmentId}</p>
                          <p className="truncate text-[10px] text-[#94A3B8]">
                            {entry.eligible ? 'Eligible' : 'Constraint hold'}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-semibold text-[#22D3EE] tabular-nums">
                          {entry.scoreBreakdown.total.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2 border-t border-white/[0.08] pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                  Quick Prompts
                </p>
                {PROMPT_GRID.slice(0, 4).map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    disabled={loading}
                    onClick={() => void askAssistant(item.prompt)}
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0B1220] px-2.5 py-2 text-left text-xs text-[#CBD5E1] hover:border-[#22D3EE]/40 hover:bg-[#17243A] cursor-pointer"
                  >
                    {item.prompt}
                  </button>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      )}
    </AppShell>
  );
};
