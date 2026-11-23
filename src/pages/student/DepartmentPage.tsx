import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, Calendar, Cpu, Layers, Sparkles } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { EquipmentCard } from '../../components/EquipmentCard';
import { AppImage } from '../../components/ui/AppImage';
import { Button, Card, EmptyState, StatCard } from '../../components/ui/Primitives';
import { getDepartmentCssVars, getDepartmentTheme } from '../../config/departmentThemes';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { DEMO_SCENARIO_DAY } from '../../engine/constants';

export const DepartmentPage: React.FC = () => {
  const { departmentId } = useParams<{ departmentId: string }>();
  const { user } = useAuth();
  const { data } = useData();

  const theme = getDepartmentTheme(departmentId);
  const deptRecord = data.departments.find((d) => d.id === theme.id);
  const deptLabs = useMemo(
    () => data.laboratories.filter((l) => l.departmentId === theme.id),
    [data.laboratories, theme.id]
  );
  const deptEquipment = useMemo(
    () => data.equipment.filter((e) => e.departmentId === theme.id && e.isActive),
    [data.equipment, theme.id]
  );
  const operationalCount = useMemo(
    () => deptEquipment.filter((e) => e.maintenanceStatus === 'operational').length,
    [deptEquipment]
  );
  const activeBookingsCount = useMemo(
    () =>
      data.bookings.filter((b) => {
        const eq = data.equipment.find((e) => e.id === b.equipmentId);
        return eq?.departmentId === theme.id && (b.status === 'approved' || b.status === 'checked_in');
      }).length,
    [data.bookings, data.equipment, theme.id]
  );

  // 7-day occupancy strip per lab computed strictly from stored schedules/bookings
  const lab7DayHeat = useMemo(() => {
    const base = new Date(`${DEMO_SCENARIO_DAY}T00:00:00Z`);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const map = new Map<string, Array<{ date: string; bookedCount: number }>>();
    deptLabs.forEach((lab) => {
      const labEqIds = new Set(deptEquipment.filter((e) => e.laboratoryId === lab.id).map((e) => e.id));
      map.set(
        lab.id,
        dates.map((dt) => {
          const schedSlots = data.equipmentDaySchedules
            .filter((s) => s.date === dt && labEqIds.has(s.equipmentId))
            .reduce((acc, s) => acc + s.intervals.length, 0);
          return { date: dt, bookedCount: schedSlots };
        })
      );
    });
    return map;
  }, [deptLabs, deptEquipment, data.equipmentDaySchedules]);

  const rolePrefix = user?.role === 'faculty' ? '/faculty' : user?.role === 'admin' ? '/admin' : '/student';

  return (
    <AppShell
      title={`${theme.code} · ${deptRecord?.name ?? theme.name}`}
      subtitle={`${theme.building} — ${theme.tagline}`}
      tier="B"
      backdropImageSlot={theme.heroSlot}
      departmentId={theme.id}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to={`${rolePrefix}/campus?dept=${theme.id}`}>
            <Button variant="primary" size="sm">
              <Layers className="h-3.5 w-3.5" />
              Explore in 3D Campus
            </Button>
          </Link>
          {user?.role === 'student' && (
            <Link to={`/student/command-center?dept=${theme.id}`}>
              <Button variant="secondary" size="sm">
                <Sparkles className="h-3.5 w-3.5 text-[#22D3EE]" />
                Ask LabLink AI
              </Button>
            </Link>
          )}
        </div>
      }
    >
      <div style={getDepartmentCssVars(theme.id)} className="space-y-8">
        <div>
          <Link
            to={`${rolePrefix}/campus`}
            className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Campus Explorer
          </Link>
        </div>

        {/* Hero Visual Banner */}
        <div className="relative h-56 sm:h-64 overflow-hidden rounded-2xl border border-white/[0.1]">
          <AppImage
            slot={theme.heroSlot}
            departmentId={theme.id}
            alt={`${theme.name} at ${theme.building}`}
            scrim="heavy"
            className="h-full w-full"
            priority
          >
            <div className="absolute inset-0 flex flex-col justify-end p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className="font-mono font-semibold"
                  style={{ color: 'var(--dept-accent2)' }}
                >
                  {theme.building}
                </span>
                <span className="text-[#64748B]">·</span>
                <span className="text-[#CBD5E1]">{deptLabs.length} shared laboratories</span>
              </div>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold text-[#F8FAFC]">
                {deptRecord?.name ?? theme.name}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[#CBD5E1]">{theme.tagline}</p>
            </div>
          </AppImage>
        </div>

        {/* Live Stats Strip */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Department Assets" value={deptEquipment.length} accent="blue" icon={<Cpu className="h-4 w-4" />} />
          <StatCard label="Operational Ready" value={operationalCount} accent="emerald" icon={<Building2 className="h-4 w-4" />} />
          <StatCard label="Shared Laboratories" value={deptLabs.length} accent="cyan" icon={<Layers className="h-4 w-4" />} />
          <StatCard label="Active Bookings" value={activeBookingsCount} accent="violet" icon={<Calendar className="h-4 w-4" />} />
        </div>

        {/* Laboratory Preview Cards with 7-day occupancy strip */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-[#F8FAFC]">Laboratories in {theme.building}</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {deptLabs.map((lab) => {
              const days = lab7DayHeat.get(lab.id) ?? [];
              const labAssetCount = deptEquipment.filter((e) => e.laboratoryId === lab.id).length;
              return (
                <Card key={lab.id} className="space-y-4" style={{ borderTopColor: theme.accent, borderTopWidth: '2px' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs" style={{ color: theme.accent2 }}>
                        {lab.building} · {lab.room}
                      </p>
                      <h3 className="mt-0.5 font-display text-lg font-semibold text-[#F8FAFC]">
                        {lab.name}
                      </h3>
                      <p className="mt-1 text-xs text-[#94A3B8]">
                        Hours {lab.openHour}–{lab.closeHour} · Capacity {lab.capacity} · {labAssetCount} assets
                      </p>
                    </div>
                    <Link to={`${rolePrefix}/campus?dept=${theme.id}&lab=${lab.id}`}>
                      <Button size="sm" variant="secondary">
                        Enter Laboratory
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>

                  {/* Real 7-day occupancy strip */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
                      <span>7-day stored slot load</span>
                      <span>Starting {DEMO_SCENARIO_DAY}</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {days.map((d) => {
                        const intensity =
                          d.bookedCount === 0
                            ? 'bg-[#0B1220] border-white/[0.06] text-[#64748B]'
                            : d.bookedCount <= 2
                            ? 'bg-[#3B82F6]/20 border-[#3B82F6]/40 text-[#93C5FD]'
                            : 'bg-[#F59E0B]/20 border-[#F59E0B]/45 text-[#FCD34D]';
                        return (
                          <div
                            key={d.date}
                            title={`${d.date}: ${d.bookedCount} booked slot(s)`}
                            className={`rounded-md border px-1.5 py-1.5 text-center text-[10px] tabular-nums ${intensity}`}
                          >
                            <div className="font-mono">{d.date.slice(5)}</div>
                            <div className="mt-0.5 font-semibold">{d.bookedCount}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Department Equipment Discovery */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-[#F8FAFC]">
              Available Hardware in {theme.code}
            </h2>
            {user?.role === 'student' && (
              <Link to={`/student/equipment?dept=${theme.id}`} className="text-xs font-medium text-[#22D3EE] hover:underline">
                View in Full Marketplace →
              </Link>
            )}
          </div>

          {deptEquipment.length === 0 ? (
            <EmptyState
              title="No active equipment found"
              description="This department currently has no active catalog records."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deptEquipment.map((eq) => (
                <EquipmentCard
                  key={eq.id}
                  equipment={eq}
                  department={deptRecord}
                  laboratory={deptLabs.find((l) => l.id === eq.laboratoryId)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
};
