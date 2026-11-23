import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Compass,
  Cpu,
  Lock,
  QrCode,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { CATEGORY_META } from '../../components/CategoryIllustration';
import type { TwinStationId } from '../../components/three/CampusHeroScene';
import { TWIN_STATIONS } from '../../components/three/CampusHeroScene';
import { AppImage } from '../../components/ui/AppImage';
import { Button, Card, GlassPanel } from '../../components/ui/Primitives';
import { DEPARTMENT_THEME_LIST } from '../../config/departmentThemes';
import { resolveManifestSlotForEquipment } from '../../config/imageManifest';
import { useAuth, getHomeRouteForRole } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { computeAnalytics } from '../../data/analytics';
import type { EquipmentCategory } from '../../types/models';

const CampusHeroScene = lazy(() => import('../../components/three/CampusHeroScene'));
const CampusNetworkGraph = lazy(() => import('../../components/three/CampusNetworkGraph'));

const CATEGORIES = Object.keys(CATEGORY_META) as EquipmentCategory[];

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: 'Register Academic Project',
    detail: 'Attach every lab request to an active capstone or research milestone with a real deadline.',
  },
  {
    step: '02',
    title: 'Explore Across Campus',
    detail: 'Inspect live bays across Turing Center, Maxwell Hall, Watt Pavilion, and Asimov Block.',
  },
  {
    step: '03',
    title: 'Command Center Match',
    detail: 'Ask LabLink AI in natural language; matches are grounded strictly in stored hardware specs.',
  },
  {
    step: '04',
    title: '12 Constraints & 5-Factor Score',
    detail: 'Deterministic engine validates hours, certifications, maintenance, and fair-use quotas.',
  },
  {
    step: '05',
    title: 'Atomic Approval & QR Pass',
    detail: 'Transactional schedule locks prevent double-booking and issue verifiable QR lab check-ins.',
  },
];

const SCORE_FACTORS = [
  { label: 'Deadline Urgency', weight: 35, color: '#3B82F6' },
  { label: 'Equipment Necessity', weight: 25, color: '#8B5CF6' },
  { label: '30d Fairness', weight: 20, color: '#10B981' },
  { label: 'Slot Feasibility', weight: 15, color: '#22D3EE' },
  { label: 'Wait Time', weight: 5, color: '#F59E0B' },
];

export const LandingPage: React.FC = () => {
  const { user } = useAuth();
  const { data } = useData();
  const [activeStep, setActiveStep] = useState(0);
  const [selectedStation, setSelectedStation] = useState<TwinStationId | null>(null);
  const [scrollParallax, setScrollParallax] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const onScroll = () => {
      setScrollParallax(Math.min(48, window.scrollY * 0.08));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const activeTwinStation = useMemo(
    () => TWIN_STATIONS.find((s) => s.id === selectedStation) ?? TWIN_STATIONS[0],
    [selectedStation]
  );

  const matchedEquipment = useMemo(() => {
    if (!selectedStation || selectedStation === 'hub') return null;
    return data.equipment.find((e) => e.equipmentId === activeTwinStation.code) ?? null;
  }, [data.equipment, selectedStation, activeTwinStation.code]);

  const networkData = useMemo(() => {
    const analytics = computeAnalytics(data, {
      startDate: '2026-02-15',
      endDate: '2026-03-10',
    });
    const deptsById = new Map(data.departments.map((d) => [d.id, d]));
    const deptUtilMap = new Map(analytics.byDepartment.map((d) => [d.departmentId, d.utilizationPct]));
    const labs = data.laboratories.map((lab) => ({
      id: lab.id,
      name: lab.name,
      departmentCode: deptsById.get(lab.departmentId)?.code ?? 'LAB',
      utilizationPct: deptUtilMap.get(lab.departmentId) ?? 0,
      equipmentCount: data.equipment.filter((e) => e.laboratoryId === lab.id).length,
    }));
    const links = [
      { fromLabId: 'lab-ai-innov', toLabId: 'lab-gpu-comp', weight: 3 },
      { fromLabId: 'lab-ai-innov', toLabId: 'lab-iot', weight: 2 },
      { fromLabId: 'lab-robotics', toLabId: 'lab-iot', weight: 2 },
      { fromLabId: 'lab-robotics', toLabId: 'lab-mech', weight: 2 },
      { fromLabId: 'lab-elec', toLabId: 'lab-gpu-comp', weight: 1 },
    ];
    return { labs, links };
  }, [data]);

  return (
    <div className="min-h-screen bg-[#070B14] text-[#F8FAFC]">
      {/* Strict 3-Zone Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#070B14]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#22D3EE] text-[#070B14] font-bold text-sm">
              L
            </div>
            <span className="font-display text-base font-semibold tracking-tight">LabLink Nexus</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-[#94A3B8]">
            <a href="#departments" className="hover:text-[#F8FAFC] whitespace-nowrap transition-colors">
              Departments
            </a>
            <a href="#features" className="hover:text-[#F8FAFC] whitespace-nowrap transition-colors">
              Architecture
            </a>
            <a href="#workflow" className="hover:text-[#F8FAFC] whitespace-nowrap transition-colors">
              Workflow
            </a>
            <a href="#categories" className="hover:text-[#F8FAFC] whitespace-nowrap transition-colors">
              Equipment
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            {user ? (
              <Link to={getHomeRouteForRole(user.role)}>
                <Button size="md" variant="primary">
                  Open Console
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button size="md" variant="ghost">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="md" variant="primary">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Tier A Cinematic Campus Hero */}
      <section className="relative overflow-hidden border-b border-white/[0.08]">
        {/* Atmospheric aerial dusk layer behind hero */}
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-30 transition-transform duration-200"
          style={{ transform: `translate3d(0, ${scrollParallax}px, 0) scale(1.05)` }}
          aria-hidden="true"
        >
          <AppImage slot="campus/hero-aerial" className="h-full w-full" scrim="heavy" priority />
        </div>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:items-center lg:py-20">
          <div className="lg:col-span-6 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#22D3EE]">
              One Campus. Every Lab. Unlimited Possibilities.
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-[#F8FAFC] sm:text-5xl lg:text-[3.35rem] lg:leading-[1.06]">
              The Intelligent University Research Campus.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[#CBD5E1]">
              Explore five interconnected engineering buildings, discover idle GPUs, robotics cells,
              and instrumentation across departments, and allocate contention fairly with a
              deterministic 12-rule engine plus explainable Gemini guidance.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link to={user ? `/${user.role === 'student' ? 'student' : user.role}/campus` : '/login'}>
                <Button size="lg" variant="primary">
                  <Compass className="h-4 w-4" />
                  Explore Campus
                </Button>
              </Link>
              <Link to={user?.role === 'student' ? '/student/command-center' : '/login'}>
                <Button size="lg" variant="secondary">
                  <Sparkles className="h-4 w-4 text-[#22D3EE]" />
                  Discover LabLink AI
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-white/[0.1] pt-6 sm:grid-cols-4">
              <div>
                <div className="font-display text-2xl font-semibold tabular-nums text-[#F8FAFC]">
                  {data.equipment.length}
                </div>
                <div className="text-xs text-[#94A3B8]">Hardware Assets</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold tabular-nums text-[#F8FAFC]">
                  {data.laboratories.length}
                </div>
                <div className="text-xs text-[#94A3B8]">Shared Labs</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold tabular-nums text-[#F8FAFC]">
                  {data.departments.length}
                </div>
                <div className="text-xs text-[#94A3B8]">Departments</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold tabular-nums text-[#22D3EE]">
                  12
                </div>
                <div className="text-xs text-[#94A3B8]">Hard Constraints</div>
              </div>
            </div>
            <p className="text-[11px] text-[#94A3B8]">
              Counts above reflect the seeded campus inventory loaded in this environment.
            </p>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <div className="relative h-[370px] overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0B1220] shadow-[0_24px_64px_rgba(2,6,23,0.72)]">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-xs text-[#94A3B8]">
                    Loading 3D campus topology...
                  </div>
                }
              >
                <CampusHeroScene
                  selectedStation={selectedStation}
                  onSelectStation={setSelectedStation}
                />
              </Suspense>
              <div className="pointer-events-none absolute left-3.5 top-3.5 rounded-md border border-white/15 bg-[#070B14]/88 px-2.5 py-1 text-[11px] font-medium text-[#CBD5E1]">
                3D Campus Digital Twin · Click a station or drag to orbit
              </div>
              {selectedStation && (
                <button
                  type="button"
                  onClick={() => setSelectedStation(null)}
                  className="absolute right-3.5 top-3.5 inline-flex items-center gap-1 rounded-md border border-white/15 bg-[#070B14]/92 px-2.5 py-1 text-[11px] font-medium text-[#22D3EE] hover:border-[#22D3EE]/50 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" /> Reset View
                </button>
              )}
            </div>

            <GlassPanel padding="sm" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {TWIN_STATIONS.map((s) => {
                    const isSelected = (selectedStation ?? 'hub') === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedStation(s.id === selectedStation ? null : s.id)}
                        className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-[#22D3EE]/60 bg-[#17243A] text-[#F8FAFC]'
                            : 'border-white/[0.08] bg-[#111B2E]/70 text-[#94A3B8] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {s.code}
                      </button>
                    );
                  })}
                </div>
                <span className="font-mono text-[11px] text-[#22D3EE]">Sample Scenario</span>
              </div>

              {selectedStation && selectedStation !== 'hub' ? (
                <div className="rounded-lg border border-[#22D3EE]/25 bg-[#111B2E]/90 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#22D3EE]">
                        {activeTwinStation.code}
                      </span>
                      <span className="truncate font-semibold text-[#F8FAFC]">
                        {matchedEquipment?.name ?? activeTwinStation.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#94A3B8] truncate">
                      {activeTwinStation.departmentCode} · {activeTwinStation.labName}
                    </p>
                  </div>
                  <Link
                    to={
                      matchedEquipment && user?.role === 'student'
                        ? `/student/equipment/${matchedEquipment.id}`
                        : '/login'
                    }
                    className="shrink-0 text-xs font-medium text-[#22D3EE] hover:underline whitespace-nowrap"
                  >
                    Inspect asset →
                  </Link>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { rank: '#1', name: 'Aarav Sharma', score: '83.8', slot: '11:00–13:00 (Assigned)' },
                    { rank: '#2', name: 'Maya Patel', score: '75.8', slot: '13:00–15:00 (Shifted)' },
                    { rank: '#3', name: 'Rohan Verma', score: '71.4', slot: 'Next day 09:00 · >10h' },
                  ].map((row) => (
                    <div
                      key={row.rank}
                      className="rounded-lg border border-white/[0.08] bg-[#111B2E]/90 p-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-[#22D3EE]">{row.rank}</span>
                        <span className="font-mono font-semibold tabular-nums text-[#F8FAFC]">
                          {row.score} pts
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs font-medium text-[#F8FAFC]">{row.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#94A3B8]">{row.slot}</p>
                    </div>
                  ))}
                </div>
              )}
            </GlassPanel>
          </div>
        </div>
      </section>

      {/* 5 Department Showcase Cards */}
      <section id="departments" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#22D3EE]">
              5 Connected Engineering Wings
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              Explore Campus Departments
            </h2>
          </div>
          <Link to={user ? '/student/campus' : '/login'}>
            <Button variant="secondary" size="md">
              <Compass className="h-4 w-4 text-[#22D3EE]" />
              Open 3D Campus Explorer
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {DEPARTMENT_THEME_LIST.map((theme) => {
            const deptEquipCount = data.equipment.filter(
              (e) => e.departmentId === theme.id && e.isActive
            ).length;
            const deptLabCount = data.laboratories.filter((l) => l.departmentId === theme.id).length;
            return (
              <Link
                key={theme.id}
                to={user ? `/${user.role === 'student' ? 'student' : user.role}/campus/${theme.id}` : '/login'}
                style={{ borderTopColor: theme.accent, borderTopWidth: '2px' }}
                className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#111B2E] transition-all duration-150 hover:-translate-y-0.5 hover:border-white/25"
              >
                <div className="relative h-32 w-full">
                  <AppImage
                    slot={theme.heroSlot}
                    departmentId={theme.id}
                    alt={`${theme.name} — ${theme.building}`}
                    scrim="bottom"
                    className="h-full w-full"
                    imgClassName="transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                  <span
                    className="absolute bottom-2.5 left-3 font-mono text-xs font-semibold"
                    style={{ color: theme.accent2 }}
                  >
                    {theme.code} · {theme.building}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-display text-sm font-semibold text-[#F8FAFC] group-hover:text-[#22D3EE] transition-colors">
                    {theme.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-[#94A3B8]">{theme.tagline}</p>
                  <div className="mt-auto pt-3 flex items-center justify-between text-[11px] font-mono text-[#CBD5E1]">
                    <span>{deptLabCount} labs</span>
                    <span>{deptEquipCount} assets</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Feature Bento + 5-Factor Scoring Breakdown */}
      <section id="features" className="border-t border-white/[0.06] bg-[#0B1220]/50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-8">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#3B82F6]">
                Deterministic Allocation Architecture
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                Transparent Scheduling Without Black-Box Guesswork
              </h2>
              <p className="mt-2 text-sm text-[#94A3B8] max-w-2xl">
                Every eligibility rule, conflict resolution, and score breakdown is auditable—while
                Gemini explains trade-offs and answers queries grounded strictly in stored campus records.
              </p>
            </div>
            <Card className="lg:col-span-5 space-y-3" padding="sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F8FAFC]">5-Factor Priority Weights</span>
                <span className="font-mono text-[#22D3EE]">100% Sum</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#070B14]">
                {SCORE_FACTORS.map((f) => (
                  <div
                    key={f.label}
                    style={{ width: `${f.weight}%`, backgroundColor: f.color }}
                    title={`${f.label}: ${f.weight}%`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#CBD5E1]">
                {SCORE_FACTORS.map((f) => (
                  <span key={f.label} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />
                    <span>{f.label}</span>
                    <span className="font-mono text-[#94A3B8]">{f.weight}%</span>
                  </span>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Building2,
                title: 'Cross-Department Sharing',
                desc: 'Discover idle GPUs, robotics cells, FPGAs, and scopes across neighboring buildings with explicit certification rules.',
              },
              {
                icon: ShieldCheck,
                title: '12 Hard Constraint Validators',
                desc: 'Enforces maintenance blackouts, lab operating hours, safety certifications, duration caps, and spec requirements.',
              },
              {
                icon: Scale,
                title: '5-Factor Fair Scoring',
                desc: 'Balances deadline urgency (35%), necessity (25%), 30-day fairness (20%), feasibility (15%), and wait time (5%).',
              },
              {
                icon: Sparkles,
                title: 'Grounded AI Command Center',
                desc: 'Translates project needs into matched equipment and valid open slots verified against real campus inventory.',
              },
              {
                icon: Lock,
                title: 'Transactional Slot Locking',
                desc: 'Per-equipment per-day schedule locks inside Firestore transactions reject overlapping approvals atomically.',
              },
              {
                icon: QrCode,
                title: 'QR Lab Check-In & Audit Log',
                desc: 'Confirmed bookings issue verifiable QR passes, track logged 30-day usage hours, and record faculty overrides.',
              },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="space-y-3" interactive>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/10 text-[#22D3EE]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-[#F8FAFC]">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-[#94A3B8]">{f.desc}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5-Step How It Works */}
      <section id="workflow" className="border-y border-white/[0.06] py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#22D3EE]">
                End-to-End Lifecycle
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
                How LabLink Allocates Resources
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WORKFLOW_STEPS.map((s, i) => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setActiveStep(i)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    activeStep === i
                      ? 'border-[#22D3EE] bg-[#22D3EE]/15 text-[#F8FAFC]'
                      : 'border-white/10 bg-[#111B2E] text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  {s.step}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {WORKFLOW_STEPS.map((s, idx) => (
              <button
                key={s.step}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                  activeStep === idx
                    ? 'border-[#3B82F6] bg-[#17243A]'
                    : 'border-white/[0.08] bg-[#111B2E] hover:border-white/20'
                }`}
              >
                <span className="font-mono text-xs font-bold text-[#22D3EE]">STEP {s.step}</span>
                <h3 className="mt-2 text-sm font-semibold text-[#F8FAFC]">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#94A3B8]">{s.detail}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Equipment Categories */}
      <section id="categories" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5CF6]">
              Unified Hardware Inventory
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight">
              8 Specialized Campus Categories
            </h2>
          </div>
          <Link to={user ? '/student/equipment' : '/login'}>
            <Button variant="secondary" size="md">
              Open Full Catalog
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const matching = data.equipment.filter((e) => e.category === cat);
            const firstEq = matching[0];
            const slot = firstEq ? resolveManifestSlotForEquipment(firstEq) : undefined;
            return (
              <Link
                key={cat}
                to={
                  user?.role === 'student'
                    ? `/student/equipment?category=${encodeURIComponent(cat)}`
                    : '/login'
                }
                className="group overflow-hidden rounded-xl border border-white/[0.08] bg-[#111B2E] hover:border-[#3B82F6]/45 transition-colors"
              >
                <div className="relative h-32 overflow-hidden">
                  <AppImage
                    slot={slot}
                    src={firstEq?.imageUrl}
                    alt={cat}
                    category={cat}
                    scrim="bottom"
                    className="h-full w-full"
                    imgClassName="transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#070B14]/88 text-[#22D3EE] border border-white/15">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="font-mono text-xs font-medium text-[#F8FAFC] tabular-nums">
                      {matching.length} assets
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-[#F8FAFC] group-hover:text-[#22D3EE] transition-colors">
                    {cat}
                  </h3>
                  <p className="mt-1 text-xs text-[#94A3B8]">{meta.shortDesc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Role Benefits & 3D Campus Network */}
      <section id="network" className="border-t border-white/[0.06] bg-[#0B1220]/50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-12">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#22D3EE]">
                Campus Lab Network (Sample Preview)
              </p>
              <h2 className="font-display text-3xl font-semibold tracking-tight">
                Break Down Silos Between Departments
              </h2>
              <p className="text-sm leading-relaxed text-[#94A3B8]">
                Visualizes cross-department equipment sharing across Turing Center, Maxwell Hall,
                Asimov Block, and Watt Pavilion based on stored booking links.
              </p>
              <div className="space-y-2.5 pt-2 text-xs text-[#CBD5E1]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                  <span>Students discover compatible alternatives across buildings</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                  <span>Faculty resolve contention with What-If weight simulation</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                  <span>Admins monitor maintenance downtime & fair-use quotas</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <Card padding="sm">
                <Suspense
                  fallback={
                    <div className="flex h-72 items-center justify-center text-xs text-[#94A3B8]">
                      Loading 3D campus lab graph...
                    </div>
                  }
                >
                  <CampusNetworkGraph labs={networkData.labs} links={networkData.links} />
                </Suspense>
              </Card>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                role: 'For Students & Researchers',
                points: [
                  'Link requests to real capstone & research deadlines',
                  'See exact alternative slots, nearby labs & split options',
                  'Receive QR lab pass & automated waitlist notifications',
                ],
              },
              {
                role: 'For Faculty & Supervisors',
                points: [
                  'Side-by-side Conflict Resolution Studio with 12 rule checks',
                  'What-If weight simulation without mutating live schedules',
                  'Audited overrides requiring justification notes',
                ],
              },
              {
                role: 'For Campus Administrators',
                points: [
                  'Full CRUD for departments, labs, equipment & maintenance',
                  'QR check-in/out verification logging actual 30d usage hours',
                  'Utilization & sharing analytics with CSV report export',
                ],
              },
            ].map((b) => (
              <Card key={b.role} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]">
                  <Cpu className="h-4 w-4 text-[#3B82F6]" />
                  {b.role}
                </div>
                <ul className="space-y-2 text-xs text-[#94A3B8]">
                  {b.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#22D3EE]" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#070B14] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <p className="font-display text-sm font-semibold text-[#F8FAFC]">
              LabLink Nexus — The Intelligent Campus Resource Network
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              One Campus. Every Lab. Unlimited Possibilities.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#94A3B8]">
            <Link to="/login" className="hover:text-[#F8FAFC]">
              Sign In
            </Link>
            <Link to="/register" className="hover:text-[#F8FAFC]">
              Create Account
            </Link>
            <a href="#departments" className="hover:text-[#F8FAFC]">
              Campus Wings
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
