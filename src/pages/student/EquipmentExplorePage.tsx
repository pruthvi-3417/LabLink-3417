import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Clock,
  Compass,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { EquipmentCard } from '../../components/EquipmentCard';
import { AppImage, resolveEquipmentImage } from '../../components/ui/AppImage';
import {
  Button,
  Drawer,
  EmptyState,
  GlassPanel,
  ProgressBar,
  Select,
  SkeletonBlock,
  StatusBadge,
} from '../../components/ui/Primitives';
import { getDepartmentTheme } from '../../config/departmentThemes';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { DEMO_SCENARIO_DAY, toDateKey } from '../../engine/constants';
import type { NLSearchFilter } from '../../schemas/validation';
import type { Equipment, EquipmentCategory, EquipmentDaySchedule, Laboratory } from '../../types/models';

const CATEGORIES: EquipmentCategory[] = [
  'GPU Workstation',
  'Robotics',
  'Embedded & IoT',
  '3D Printing',
  'Electronics & Test',
  'FPGA & Hardware',
  'Networking',
  'Research Instrument',
];

type SortMode = 'relevance' | 'name' | 'quantity' | 'session';

function computeAvailabilityStats(
  eq: Equipment,
  lab: Laboratory | undefined,
  schedules: EquipmentDaySchedule[],
  dayKey: string
): { availabilityPct: number; nextSlot: string } {
  if (!eq.isActive || eq.maintenanceStatus === 'under_maintenance') {
    return { availabilityPct: 0, nextSlot: 'Maintenance / Inactive' };
  }
  const openH = Number((lab?.openHour ?? '09:00').slice(0, 2));
  const closeH = Number((lab?.closeHour ?? '18:00').slice(0, 2));
  const totalHours = Math.max(1, closeH - openH);
  const sched = schedules.find((s) => s.equipmentId === eq.id && s.date === dayKey);
  const intervals = sched?.intervals ?? [];

  let freeHours = 0;
  let nextSlot = 'Waitlist / Next Day';

  for (let h = openH; h < closeH; h++) {
    const startMin = h * 60;
    const endMin = (h + 1) * 60;
    const bookedUnits = intervals
      .filter((iv) => {
        const ivS = Number(iv.start.slice(0, 2)) * 60 + Number(iv.start.slice(3, 5));
        const ivE = Number(iv.end.slice(0, 2)) * 60 + Number(iv.end.slice(3, 5));
        return ivS < endMin && ivE > startMin;
      })
      .reduce((sum, iv) => sum + (iv.units || 1), 0);
    if (bookedUnits < Math.max(1, eq.quantity)) {
      freeHours++;
      if (nextSlot === 'Waitlist / Next Day') {
        nextSlot = `${dayKey.slice(5)} ${String(h).padStart(2, '0')}:00`;
      }
    }
  }

  return {
    availabilityPct: Math.round((freeHours / totalHours) * 100),
    nextSlot,
  };
}

export const EquipmentExplorePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { data, loading } = useData();

  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '');
  const [category, setCategory] = useState(searchParams.get('category') ?? '');
  const [departmentId, setDepartmentId] = useState(searchParams.get('dept') ?? '');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>('relevance');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const [nlQuery, setNlQuery] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [nlMeta, setNlMeta] = useState<{ label: string; filter: NLSearchFilter } | null>(null);

  const deptById = useMemo(() => new Map(data.departments.map((d) => [d.id, d])), [data.departments]);
  const labById = useMemo(() => new Map(data.laboratories.map((l) => [l.id, l])), [data.laboratories]);
  const targetDay = user?.isDemo ? DEMO_SCENARIO_DAY : toDateKey(Date.now());

  const handleNlSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nlQuery.trim().length < 2) return;
    setNlLoading(true);
    try {
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlQuery.trim(), categories: CATEGORIES }),
      });
      const json = await res.json();
      if (json?.filter) {
        setNlMeta({ label: json.label || 'Parsed filter', filter: json.filter });
        if (json.filter.categories?.length === 1) {
          setCategory(json.filter.categories[0]);
        } else if (json.filter.categories?.length > 1) {
          setCategory('');
        }
        if (typeof json.filter.availableOnly === 'boolean') {
          setAvailableOnly(json.filter.availableOnly);
        }
      }
    } catch {
      // ignore network error and keep manual search
    } finally {
      setNlLoading(false);
    }
  };

  const clearNlFilter = () => {
    setNlMeta(null);
    setNlQuery('');
  };

  const resetAllFilters = () => {
    setCategory('');
    setDepartmentId('');
    setKeyword('');
    setAvailableOnly(false);
    setSortBy('relevance');
    clearNlFilter();
  };

  const filteredEquipment = useMemo(() => {
    const matched = data.equipment.filter((eq) => {
      if (category && eq.category !== category) return false;
      if (departmentId && eq.departmentId !== departmentId) return false;
      if (availableOnly && (!eq.isActive || eq.maintenanceStatus === 'under_maintenance')) return false;

      const kw = keyword.trim().toLowerCase();
      if (kw) {
        const hay = `${eq.equipmentId} ${eq.name} ${eq.category} ${eq.description} ${eq.building} ${JSON.stringify(eq.specs)}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }

      if (nlMeta) {
        const f = nlMeta.filter;
        if (f.categories && f.categories.length > 0 && !f.categories.includes(eq.category)) return false;
        if (f.requiresCuda && !eq.specs.cuda) return false;
        if (typeof f.minVramGB === 'number' && f.minVramGB > 0) {
          if (Number(eq.specs.vramGB ?? 0) < f.minVramGB) return false;
        }
        if (f.keywords && f.keywords.length > 0 && f.categories.length === 0) {
          const hay = `${eq.equipmentId} ${eq.name} ${eq.description} ${JSON.stringify(eq.specs)}`.toLowerCase();
          if (!f.keywords.some((k) => hay.includes(k.toLowerCase()))) return false;
        }
      }

      return true;
    });

    if (sortBy === 'name') {
      return [...matched].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortBy === 'quantity') {
      return [...matched].sort((a, b) => b.quantity - a.quantity);
    }
    if (sortBy === 'session') {
      return [...matched].sort((a, b) => b.maxBookingMins - a.maxBookingMins);
    }
    return matched;
  }, [data.equipment, category, departmentId, availableOnly, keyword, nlMeta, sortBy]);

  const hasActiveFilters = Boolean(category || departmentId || keyword || availableOnly || nlMeta);

  const filterControls = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-[#94A3B8]">Keyword / Spec</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="RTX, LiDAR, FPGA..."
            className="w-full rounded-lg border border-white/10 bg-[#0B1220] py-2 pl-9 pr-8 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              aria-label="Clear keyword"
              className="absolute right-2.5 top-2.5 text-[#64748B] hover:text-[#F8FAFC] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">All Categories (8)</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>

      <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
        <option value="">All Departments</option>
        {data.departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.code} — {d.name}
          </option>
        ))}
      </Select>

      <label className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-[#0B1220] px-3 py-2.5 text-xs text-[#F8FAFC] cursor-pointer">
        <input
          type="checkbox"
          checked={availableOnly}
          onChange={(e) => setAvailableOnly(e.target.checked)}
        />
        <span>Operational &amp; Bookable Only</span>
      </label>

      {hasActiveFilters && (
        <Button variant="secondary" size="sm" className="w-full" onClick={resetAllFilters}>
          Reset All Filters
        </Button>
      )}
    </div>
  );

  return (
    <AppShell
      title="Campus Hardware Catalog"
      subtitle={`Browse ${data.equipment.length} instruments across ${data.departments.length} departments and ${data.laboratories.length} shared laboratories.`}
      tier="C"
      actions={
        <Link to="/student/campus">
          <Button variant="secondary" size="sm">
            <Compass className="h-3.5 w-3.5 text-[#22D3EE]" />
            Open 3D Campus
          </Button>
        </Link>
      }
    >
      {/* Natural Language AI Search Bar + View/Sort Controls */}
      <GlassPanel padding="sm" className="space-y-3">
        <form onSubmit={handleNlSearch} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Sparkles className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#22D3EE]" />
            <input
              type="text"
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              placeholder='Natural-language search, e.g. "Available GPU workstation with CUDA and at least 24GB VRAM"'
              className="w-full rounded-lg border border-[#3B82F6]/35 bg-[#0B1220] py-2 pl-9 pr-3 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#22D3EE] focus:outline-none"
            />
          </div>
          <Button type="submit" loading={nlLoading}>
            <Sparkles className="h-3.5 w-3.5" />
            AI Filter
          </Button>
        </form>

        {nlMeta && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#22D3EE]/25 bg-[#0B1220] px-3 py-2 text-xs">
            <span className="font-medium text-[#22D3EE]">{nlMeta.label}:</span>
            {nlMeta.filter.categories.map((c) => (
              <span key={c} className="rounded bg-[#17243A] px-2 py-0.5 text-[#F8FAFC]">
                Category: {c}
              </span>
            ))}
            {nlMeta.filter.requiresCuda && (
              <span className="rounded bg-[#17243A] px-2 py-0.5 text-[#F8FAFC]">CUDA required</span>
            )}
            {typeof nlMeta.filter.minVramGB === 'number' && (
              <span className="rounded bg-[#17243A] px-2 py-0.5 font-mono text-[#F8FAFC]">
                VRAM &ge; {nlMeta.filter.minVramGB}GB
              </span>
            )}
            {nlMeta.filter.availableOnly && (
              <span className="rounded bg-[#17243A] px-2 py-0.5 text-[#6EE7B7]">Operational only</span>
            )}
            <button
              type="button"
              onClick={clearNlFilter}
              className="ml-auto inline-flex items-center gap-1 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> Clear AI Filter
            </button>
          </div>
        )}
      </GlassPanel>

      {/* Main Sticky Filter Sidebar + Results Area */}
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        {/* Desktop Sticky Filter Sidebar */}
        <aside className="hidden lg:block sticky top-20">
          <GlassPanel padding="md" className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F8FAFC]">
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#22D3EE]" />
                Inventory Filters
              </span>
              <span className="font-mono text-[11px] text-[#94A3B8] tabular-nums">
                {filteredEquipment.length}/{data.equipment.length}
              </span>
            </div>
            {filterControls}
          </GlassPanel>
        </aside>

        {/* Results Column */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="lg:hidden"
                onClick={() => setMobileFilterOpen(true)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
              </Button>
              <span className="text-xs tabular-nums text-[#94A3B8]">
                Showing <strong className="text-[#F8FAFC]">{filteredEquipment.length}</strong> campus instruments
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Sort equipment"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortMode)}
                className="h-8 rounded-lg border border-white/10 bg-[#0B1220] px-2.5 text-xs text-[#F8FAFC] focus:border-[#3B82F6] focus:outline-none"
              >
                <option value="relevance">Sort: Default Order</option>
                <option value="name">Sort: Name (A–Z)</option>
                <option value="quantity">Sort: Total Units</option>
                <option value="session">Sort: Max Session</option>
              </select>

              <div className="flex rounded-lg border border-white/10 bg-[#0B1220] p-0.5">
                <button
                  type="button"
                  aria-label="Grid view"
                  onClick={() => setViewMode('grid')}
                  className={`rounded-md p-1.5 cursor-pointer ${
                    viewMode === 'grid' ? 'bg-[#17243A] text-[#22D3EE]' : 'text-[#94A3B8]'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  onClick={() => setViewMode('list')}
                  className={`rounded-md p-1.5 cursor-pointer ${
                    viewMode === 'list' ? 'bg-[#17243A] text-[#22D3EE]' : 'text-[#94A3B8]'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {loading && data.equipment.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-72" />
              ))}
            </div>
          ) : filteredEquipment.length === 0 ? (
            <EmptyState
              title="No matching campus equipment"
              description="No stored laboratory instruments matched those exact filters. Reset filters or broaden VRAM/category constraints."
              action={
                <Button variant="secondary" size="sm" onClick={resetAllFilters}>
                  Reset Filters
                </Button>
              }
            />
          ) : viewMode === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredEquipment.map((eq) => {
                const lab = labById.get(eq.laboratoryId);
                const stats = computeAvailabilityStats(eq, lab, data.equipmentDaySchedules, targetDay);
                return (
                  <EquipmentCard
                    key={eq.id}
                    equipment={eq}
                    detailHref={`/student/equipment/${eq.id}`}
                    department={deptById.get(eq.departmentId)}
                    laboratory={lab}
                    availabilityPct={stats.availabilityPct}
                    nextSlot={stats.nextSlot}
                  />
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEquipment.map((eq) => {
                const lab = labById.get(eq.laboratoryId);
                const dept = deptById.get(eq.departmentId);
                const theme = getDepartmentTheme(eq.departmentId);
                const stats = computeAvailabilityStats(eq, lab, data.equipmentDaySchedules, targetDay);
                const img = resolveEquipmentImage(eq);

                return (
                  <div
                    key={eq.id}
                    style={{ borderLeftWidth: '3px', borderLeftColor: theme.accent }}
                    className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-[#111B2E] p-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg bg-[#070B14] sm:w-36">
                      <AppImage
                        src={img.src}
                        focalPoint={img.focalPoint}
                        alt={eq.name}
                        category={eq.category}
                        departmentId={eq.departmentId}
                        className="h-full w-full"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-[#22D3EE]">{eq.equipmentId}</span>
                        <span className="text-xs font-medium" style={{ color: theme.accent2 }}>
                          {dept?.code ?? eq.departmentId}
                        </span>
                        <StatusBadge status={!eq.isActive ? 'inactive' : eq.maintenanceStatus} />
                      </div>
                      <h3 className="truncate font-display text-base font-semibold text-[#F8FAFC]">{eq.name}</h3>
                      <p className="line-clamp-1 text-xs text-[#94A3B8]">{eq.description}</p>
                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#94A3B8]">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-[#64748B]" />
                          {lab?.name ?? eq.building}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-[#22D3EE]" />
                          Next: {stats.nextSlot}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 sm:w-44">
                      <ProgressBar
                        value={stats.availabilityPct}
                        label="Today free"
                        showValue
                        color={stats.availabilityPct >= 50 ? '#10B981' : stats.availabilityPct >= 20 ? '#F59E0B' : '#EF4444'}
                      />
                      <div className="flex items-center gap-1.5">
                        <Link to={`/student/equipment/${eq.id}`} className="flex-1">
                          <Button size="sm" variant="primary" className="w-full">
                            Inspect <ArrowRight className="h-3.5 w-3.5" />
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
      </div>

      {/* Mobile Filter Drawer */}
      <Drawer
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        title="Inventory Filters"
        subtitle={`${filteredEquipment.length} matching instruments`}
        side="bottom"
      >
        {filterControls}
      </Drawer>
    </AppShell>
  );
};
