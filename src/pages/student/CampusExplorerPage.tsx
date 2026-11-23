import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Map as MapIcon,
  RotateCcw,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, StatusBadge, Tabs } from '../../components/ui/Primitives';
import { DEPARTMENT_THEME_LIST, getDepartmentTheme } from '../../config/departmentThemes';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { DEMO_SCENARIO_DAY } from '../../engine/constants';
import { detectWebGLProfile } from '../../components/three/webglUtils';
import type {
  CampusCrossLink,
  EquipmentAvailabilityState,
  ExplorerEquipmentNode,
  ExplorerLevel,
} from '../../components/three/CampusExplorerScene';
import type { Equipment } from '../../types/models';

const CampusExplorerScene = lazy(() => import('../../components/three/CampusExplorerScene'));

function deriveEquipmentAvailability(
  eq: Equipment,
  activeBookingEquipmentIds: Set<string>
): EquipmentAvailabilityState {
  if (!eq.isActive || eq.maintenanceStatus === 'under_maintenance') return 'maintenance';
  if (activeBookingEquipmentIds.has(eq.id)) return 'in_use';
  return 'available';
}

export const CampusExplorerPage: React.FC = () => {
  const { user } = useAuth();
  const { data } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const profile = useMemo(() => detectWebGLProfile(), []);

  const [use2DFallback, setUse2DFallback] = useState(!profile.supported);
  const [level, setLevel] = useState<ExplorerLevel>('campus');
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [hoveredDeptId, setHoveredDeptId] = useState<string | null>(null);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [hoveredEquipmentId, setHoveredEquipmentId] = useState<string | null>(null);
  const [deptTab, setDeptTab] = useState<'overview' | 'labs' | 'equipment'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EquipmentAvailabilityState>('all');

  // Deep-link synchronization (?dept=...&lab=...&equipment=...)
  useEffect(() => {
    const qEquip = searchParams.get('equipment');
    const qLab = searchParams.get('lab');
    const qDept = searchParams.get('dept');

    if (qEquip) {
      const foundEq = data.equipment.find((e) => e.id === qEquip || e.equipmentId === qEquip);
      if (foundEq) {
        setSelectedDeptId(foundEq.departmentId);
        setSelectedLabId(foundEq.laboratoryId);
        setSelectedEquipmentId(foundEq.id);
        setLevel('lab');
        return;
      }
    }
    if (qLab) {
      const foundLab = data.laboratories.find((l) => l.id === qLab);
      if (foundLab) {
        setSelectedDeptId(foundLab.departmentId);
        setSelectedLabId(foundLab.id);
        setSelectedEquipmentId(null);
        setLevel('lab');
        return;
      }
    }
    if (qDept) {
      const theme = getDepartmentTheme(qDept);
      setSelectedDeptId(theme.id);
      setSelectedLabId(null);
      setSelectedEquipmentId(null);
      setLevel('department');
    }
  }, [searchParams, data.equipment, data.laboratories]);

  // Keyboard Escape navigates L3 -> L2 -> L1
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (level === 'lab') {
        setLevel('department');
        setSelectedEquipmentId(null);
      } else if (level === 'department') {
        setLevel('campus');
        setSelectedDeptId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [level]);

  // Real active bookings snapshot (honest stored state)
  const activeBookingEquipmentIds = useMemo(() => {
    const set = new Set<string>();
    data.bookings.forEach((b) => {
      if (b.status === 'approved' || b.status === 'checked_in') {
        set.add(b.equipmentId);
      }
    });
    return set;
  }, [data.bookings]);

  // Real cross-department links from bookings
  const crossLinks: CampusCrossLink[] = useMemo(() => {
    const eqMap = new Map(data.equipment.map((e) => [e.id, e]));
    const counts = new Map<string, CampusCrossLink>();
    data.bookings.forEach((b) => {
      const eq = eqMap.get(b.equipmentId);
      if (!eq) return;
      const from = b.departmentId;
      const to = eq.departmentId;
      if (!from || !to || from === to) return;
      const key = [from, to].sort().join('->');
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { fromDeptId: from, toDeptId: to, count: 1 });
    });
    return Array.from(counts.values());
  }, [data.bookings, data.equipment]);

  const deptStatsMap = useMemo(() => {
    const out: Record<string, string> = {};
    DEPARTMENT_THEME_LIST.forEach((t) => {
      const items = data.equipment.filter((e) => e.departmentId === t.id && e.isActive);
      const avail = items.filter(
        (e) => deriveEquipmentAvailability(e, activeBookingEquipmentIds) === 'available'
      ).length;
      out[t.id] = `${avail}/${items.length} ready`;
    });
    return out;
  }, [data.equipment, activeBookingEquipmentIds]);

  const selectedDeptTheme = useMemo(
    () => (selectedDeptId ? getDepartmentTheme(selectedDeptId) : null),
    [selectedDeptId]
  );

  const deptLabs = useMemo(
    () => (selectedDeptId ? data.laboratories.filter((l) => l.departmentId === selectedDeptId) : []),
    [data.laboratories, selectedDeptId]
  );

  const deptEquipment = useMemo(() => {
    return data.equipment.filter((eq) => {
      if (selectedDeptId && eq.departmentId !== selectedDeptId) return false;
      const st = deriveEquipmentAvailability(eq, activeBookingEquipmentIds);
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !eq.name.toLowerCase().includes(q) &&
          !eq.equipmentId.toLowerCase().includes(q) &&
          !eq.category.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [data.equipment, selectedDeptId, statusFilter, searchQuery, activeBookingEquipmentIds]);

  const activeLab = useMemo(
    () =>
      data.laboratories.find((l) => l.id === selectedLabId) ??
      deptLabs[0] ??
      null,
    [data.laboratories, selectedLabId, deptLabs]
  );

  const labEquipmentNodes: ExplorerEquipmentNode[] = useMemo(() => {
    const items = data.equipment.filter((eq) => {
      if (activeLab && eq.laboratoryId !== activeLab.id) return false;
      const st = deriveEquipmentAvailability(eq, activeBookingEquipmentIds);
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!eq.name.toLowerCase().includes(q) && !eq.equipmentId.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });

    const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(items.length))));
    return items.map((eq, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = (col - (cols - 1) / 2) * 2.6;
      const z = (row - 0.5) * 2.5;
      return {
        equipment: eq,
        state: deriveEquipmentAvailability(eq, activeBookingEquipmentIds),
        position: [x, 0, z],
      };
    });
  }, [data.equipment, activeLab, statusFilter, searchQuery, activeBookingEquipmentIds]);

  const activeEquipment = useMemo(
    () => data.equipment.find((e) => e.id === selectedEquipmentId) ?? null,
    [data.equipment, selectedEquipmentId]
  );

  const activeEquipmentNextSlot = useMemo(() => {
    if (!activeEquipment) return null;
    const sched = data.equipmentDaySchedules.find(
      (s) => s.equipmentId === activeEquipment.id && s.date === DEMO_SCENARIO_DAY
    );
    const booked = sched?.intervals ?? [];
    if (booked.length === 0) return '09:00–11:00 today';
    const lastEndIso = booked[booked.length - 1]?.end ?? '';
    const lastHHMM = lastEndIso.includes('T') ? lastEndIso.slice(11, 16) : lastEndIso.slice(0, 5);
    return lastHHMM && lastHHMM < '17:00' ? `After ${lastHHMM} today` : 'Tomorrow 09:00';
  }, [activeEquipment, data.equipmentDaySchedules]);

  const selectDepartment = (deptId: string) => {
    setSelectedDeptId(deptId);
    setSelectedLabId(null);
    setSelectedEquipmentId(null);
    setLevel('department');
    setSearchParams({ dept: deptId });
  };

  const enterLab = (labId: string) => {
    const lab = data.laboratories.find((l) => l.id === labId);
    if (!lab) return;
    setSelectedDeptId(lab.departmentId);
    setSelectedLabId(lab.id);
    setSelectedEquipmentId(null);
    setLevel('lab');
    setSearchParams({ dept: lab.departmentId, lab: lab.id });
  };

  const resetCampus = () => {
    setLevel('campus');
    setSelectedDeptId(null);
    setSelectedLabId(null);
    setSelectedEquipmentId(null);
    setSearchParams({});
  };

  const rolePrefix = user?.role === 'faculty' ? '/faculty' : user?.role === 'admin' ? '/admin' : '/student';

  return (
    <AppShell
      title="3D Campus Explorer"
      subtitle="Interactive spatial twin of Turing Center, Maxwell Hall, Watt Pavilion, and Asimov Block."
      tier="A"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setUse2DFallback((v) => !v)}
          >
            {use2DFallback ? <Layers className="h-3.5 w-3.5" /> : <MapIcon className="h-3.5 w-3.5" />}
            {use2DFallback ? 'Switch to 3D' : '2D Isometric Map'}
          </Button>
          {level !== 'campus' && (
            <Button variant="outline" size="sm" onClick={resetCampus}>
              <RotateCcw className="h-3.5 w-3.5" />
              Campus Overview
            </Button>
          )}
        </div>
      }
    >
      <div className="relative h-[calc(100vh-14.5rem)] min-h-[540px] w-full overflow-hidden rounded-2xl border border-white/[0.1] bg-[#070B14]">
        {/* 3D Canvas OR 2D Isometric Map */}
        {!use2DFallback && profile.supported ? (
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-sm text-[#94A3B8]">
                Initializing 3D Campus Environment...
              </div>
            }
          >
            <CampusExplorerScene
              level={level}
              selectedDeptId={selectedDeptId}
              hoveredDeptId={hoveredDeptId}
              onHoverDept={setHoveredDeptId}
              onSelectDept={selectDepartment}
              selectedLab={activeLab}
              labEquipmentNodes={labEquipmentNodes}
              selectedEquipmentId={selectedEquipmentId}
              hoveredEquipmentId={hoveredEquipmentId}
              onHoverEquipment={setHoveredEquipmentId}
              onSelectEquipment={(id) => {
                setSelectedEquipmentId(id);
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('equipment', id);
                  return next;
                });
              }}
              deptStatsMap={deptStatsMap}
              crossLinks={crossLinks}
            />
          </Suspense>
        ) : (
          <div className="flex h-full w-full flex-col justify-center overflow-y-auto p-6">
            <div className="mx-auto w-full max-w-4xl space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-[#94A3B8]">
                  2D Isometric Campus Map · Click a building to inspect labs and live equipment status
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {DEPARTMENT_THEME_LIST.map((theme) => {
                  const items = data.equipment.filter((e) => e.departmentId === theme.id);
                  const ready = items.filter(
                    (e) => deriveEquipmentAvailability(e, activeBookingEquipmentIds) === 'available'
                  ).length;
                  const labs = data.laboratories.filter((l) => l.departmentId === theme.id);
                  const active = selectedDeptId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => selectDepartment(theme.id)}
                      className={`rounded-xl border p-4 text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-[#17243A] border-white/25'
                          : 'bg-[#111B2E]/90 border-white/[0.08] hover:border-white/20'
                      }`}
                      style={{ borderTopColor: theme.accent, borderTopWidth: '3px' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold" style={{ color: theme.accent2 }}>
                          {theme.code}
                        </span>
                        <span className="text-xs tabular-nums text-[#6EE7B7]">
                          {ready}/{items.length} ready
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-display text-base font-semibold text-[#F8FAFC]">
                        {theme.building}
                      </h3>
                      <p className="text-xs text-[#94A3B8]">{theme.name}</p>
                      <p className="mt-2 text-[11px] text-[#64748B]">
                        {labs.map((l) => l.name).join(' · ')}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TOP-LEFT HUD: Search + Status Filters (solid dark HUD fill, zero backdrop-blur over WebGL) */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2 max-w-[300px]">
          <div className="pointer-events-auto glass-hud rounded-xl p-2 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[#64748B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Locate GPU, scope, arm..."
                aria-label="Locate equipment on campus"
                className="w-full rounded-lg border border-white/10 bg-[#070B14] py-1.5 pl-8 pr-2.5 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'available', label: 'Available' },
                  { id: 'in_use', label: 'In Use' },
                  { id: 'maintenance', label: 'Service' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setStatusFilter(chip.id)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    statusFilter === chip.id
                      ? 'bg-[#3B82F6] text-white'
                      : 'bg-[#070B14]/80 text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TOP-RIGHT HUD: Department Selector */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 hidden sm:flex flex-wrap justify-end gap-1.5 max-w-md">
          <div className="pointer-events-auto glass-hud flex flex-wrap items-center gap-1 rounded-xl p-1.5">
            {DEPARTMENT_THEME_LIST.map((t) => {
              const active = selectedDeptId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectDepartment(t.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active ? 'text-[#070B14] font-semibold' : 'text-[#CBD5E1] hover:bg-white/[0.06]'
                  }`}
                  style={active ? { backgroundColor: t.accent2 } : undefined}
                >
                  {t.code}
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTTOM-LEFT HUD: Semantic Legend (Icon + Color + Text, never color alone) */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden md:block">
          <div className="glass-hud flex items-center gap-3 rounded-xl px-3 py-1.5 text-[11px] text-[#CBD5E1]">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" /> Available
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#F59E0B]" /> In Use
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-[#EF4444]" /> Maintenance
            </span>
          </div>
        </div>

        {/* BOTTOM-CENTER HUD: Navigation Breadcrumb Pill */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
          <div className="pointer-events-auto glass-hud flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs">
            <button
              type="button"
              onClick={resetCampus}
              className={`cursor-pointer transition-colors ${
                level === 'campus' ? 'font-semibold text-[#22D3EE]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              Campus
            </button>
            {selectedDeptTheme && (
              <>
                <span className="text-[#475569]">/</span>
                <button
                  type="button"
                  onClick={() => selectDepartment(selectedDeptTheme.id)}
                  className={`cursor-pointer transition-colors whitespace-nowrap ${
                    level === 'department'
                      ? 'font-semibold text-[#22D3EE]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  {selectedDeptTheme.code} · {selectedDeptTheme.building}
                </button>
              </>
            )}
            {level === 'lab' && activeLab && (
              <>
                <span className="text-[#475569]">/</span>
                <span className="font-semibold text-[#F8FAFC] whitespace-nowrap">{activeLab.name}</span>
              </>
            )}
          </div>
        </div>

        {/* CONTEXTUAL SIDE INSPECTOR PANEL (L2 Department or L3 Lab / Equipment) */}
        {(level === 'department' || level === 'lab') && selectedDeptTheme && (
          <aside className="absolute bottom-14 right-3 top-16 z-20 flex w-[calc(100%-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0B1220]/95 shadow-2xl">
            <div
              className="flex items-start justify-between gap-3 border-b border-white/[0.08] p-4"
              style={{
                background: `linear-gradient(135deg, ${selectedDeptTheme.surfaceTint}, transparent)`,
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-xs font-semibold"
                    style={{ color: selectedDeptTheme.accent2 }}
                  >
                    {selectedDeptTheme.code}
                  </span>
                  <span className="text-xs text-[#94A3B8]">· {selectedDeptTheme.building}</span>
                </div>
                <h2 className="mt-0.5 font-display text-base font-semibold text-[#F8FAFC] truncate">
                  {level === 'lab' && activeLab ? activeLab.name : selectedDeptTheme.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (level === 'lab') {
                    setLevel('department');
                    setSelectedEquipmentId(null);
                  } else {
                    resetCampus();
                  }
                }}
                aria-label="Go back"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#111B2E] px-2.5 py-1 text-xs text-[#CBD5E1] hover:text-white cursor-pointer"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {level === 'department' ? (
                <>
                  <Tabs
                    activeId={deptTab}
                    onChange={(id) => setDeptTab(id as 'overview' | 'labs' | 'equipment')}
                    items={[
                      { id: 'overview', label: 'Overview' },
                      { id: 'labs', label: 'Labs', count: deptLabs.length },
                      { id: 'equipment', label: 'Assets', count: deptEquipment.length },
                    ]}
                  />

                  {deptTab === 'overview' && (
                    <div className="space-y-3">
                      <p className="text-xs leading-relaxed text-[#CBD5E1]">
                        {selectedDeptTheme.tagline}
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-lg border border-white/[0.08] bg-[#111B2E] p-3">
                          <span className="text-[11px] text-[#94A3B8]">Laboratories</span>
                          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[#F8FAFC]">
                            {deptLabs.length}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/[0.08] bg-[#111B2E] p-3">
                          <span className="text-[11px] text-[#94A3B8]">Hardware Units</span>
                          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[#F8FAFC]">
                            {deptEquipment.length}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 pt-1">
                        {deptLabs[0] && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => enterLab(deptLabs[0].id)}
                            className="w-full"
                          >
                            Enter {deptLabs[0].name}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Link to={`${rolePrefix}/campus/${selectedDeptTheme.id}`}>
                          <Button size="sm" variant="secondary" className="w-full">
                            <Building2 className="h-3.5 w-3.5" />
                            Open Department Page
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}

                  {deptTab === 'labs' && (
                    <div className="space-y-2.5">
                      {deptLabs.map((lab) => {
                        const labItems = data.equipment.filter((e) => e.laboratoryId === lab.id);
                        return (
                          <div
                            key={lab.id}
                            className="rounded-xl border border-white/[0.08] bg-[#111B2E] p-3 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="text-xs font-semibold text-[#F8FAFC]">{lab.name}</h3>
                                <p className="text-[11px] text-[#94A3B8]">
                                  {lab.room} · {lab.openHour}–{lab.closeHour} · {labItems.length} assets
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => enterLab(lab.id)}
                              className="w-full"
                            >
                              Enter 3D Cutaway Room
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {deptTab === 'equipment' && (
                    <div className="space-y-2">
                      {deptEquipment.map((eq) => {
                        const state = deriveEquipmentAvailability(eq, activeBookingEquipmentIds);
                        return (
                          <button
                            key={eq.id}
                            type="button"
                            onClick={() => {
                              setSelectedLabId(eq.laboratoryId);
                              setSelectedEquipmentId(eq.id);
                              setLevel('lab');
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#111B2E] p-2.5 text-left hover:border-[#3B82F6]/45 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-[#F8FAFC]">{eq.name}</p>
                              <p className="text-[11px] text-[#94A3B8] font-mono">{eq.equipmentId}</p>
                            </div>
                            <StatusBadge status={state} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {activeLab && (
                    <p className="text-xs text-[#94A3B8]">
                      Room {activeLab.room} · Hours {activeLab.openHour}–{activeLab.closeHour} · Click any equipment unit inside the 3D bay.
                    </p>
                  )}

                  {activeEquipment ? (
                    <div className="rounded-xl border border-[#22D3EE]/30 bg-[#111B2E] p-3.5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-[11px] text-[#22D3EE]">
                            {activeEquipment.equipmentId}
                          </span>
                          <h3 className="text-sm font-semibold text-[#F8FAFC]">
                            {activeEquipment.name}
                          </h3>
                        </div>
                        <StatusBadge
                          status={deriveEquipmentAvailability(
                            activeEquipment,
                            activeBookingEquipmentIds
                          )}
                        />
                      </div>
                      <p className="text-xs text-[#94A3B8]">{activeEquipment.description}</p>
                      <div className="rounded-lg bg-[#070B14]/70 px-3 py-2 text-xs">
                        <span className="text-[#64748B]">Next availability: </span>
                        <span className="font-medium text-[#F8FAFC] tabular-nums">
                          {activeEquipmentNextSlot}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {user?.role === 'student' ? (
                          <Link to={`/student/equipment/${activeEquipment.id}`} className="flex-1">
                            <Button size="sm" variant="primary" className="w-full">
                              Request Access
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        ) : (
                          <Link
                            to={user?.role === 'admin' ? `/admin/equipment/${activeEquipment.id}/edit` : '/faculty/equipment'}
                            className="flex-1"
                          >
                            <Button size="sm" variant="primary" className="w-full">
                              Inspect Record
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/[0.08] bg-[#111B2E]/60 p-3 text-xs text-[#94A3B8]">
                      Select an equipment station in the 3D bay or from the list below to inspect live availability.
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-[#94A3B8]">
                      Stations in this laboratory ({labEquipmentNodes.length})
                    </p>
                    {labEquipmentNodes.map((node) => (
                      <button
                        key={node.equipment.id}
                        type="button"
                        onClick={() => setSelectedEquipmentId(node.equipment.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                          selectedEquipmentId === node.equipment.id
                            ? 'border-[#22D3EE]/60 bg-[#17243A]'
                            : 'border-white/[0.08] bg-[#111B2E] hover:border-white/20'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Cpu className="h-3.5 w-3.5 shrink-0 text-[#22D3EE]" />
                          <span className="truncate text-[#F8FAFC]">{node.equipment.name}</span>
                        </span>
                        <StatusBadge status={node.state} />
                      </button>
                    ))}
                  </div>

                  {user?.role === 'student' && (
                    <Link to="/student/command-center" className="block pt-1">
                      <Button size="sm" variant="outline" className="w-full">
                        <Sparkles className="h-3.5 w-3.5 text-[#22D3EE]" />
                        Ask LabLink AI Command Center
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </AppShell>
  );
};
