import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarCheck, Cpu, Sliders } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, DashboardSkeleton, EmptyState, StatCard, StatusBadge } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { runAllocationEngine } from '../../engine/allocator';
import { DEMO_NOW, formatLocalIso } from '../../engine/constants';

export const FacultyDashboard: React.FC = () => {
  const { user } = useAuth();
  const { data, loading } = useData();

  const pendingReqs = useMemo(
    () => data.bookingRequests.filter((r) => ['submitted', 'pending_approval', 'ai_recommended'].includes(r.status)),
    [data.bookingRequests]
  );

  const allocSummary = useMemo(() => {
    const nowIso = data.bookingRequests.some((r) => r.isDemo) ? DEMO_NOW : formatLocalIso(Date.now());
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
  }, [data]);

  const conflictGroups = allocSummary.conflictGroups.filter((g) => g.hasConflict);
  const supervisedEq = data.equipment.filter((e) => !user || e.responsibleFacultyId === user.uid || user.role === 'admin');
  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);
  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users]);

  return (
    <AppShell
      title="Faculty Supervision Console"
      subtitle="Arbitrate competing resource requests with transparent deadline-aware scoring."
      actions={
        <Link to="/faculty/allocation">
          <Button variant="primary">
            <Sliders className="h-4 w-4" />
            Open Conflict Resolution Studio
          </Button>
        </Link>
      }
    >
      {loading && data.equipment.length === 0 ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Pending Requests"
              value={pendingReqs.length}
              sublabel="Awaiting review"
              icon={<CalendarCheck className="h-4 w-4" />}
              accent="amber"
            />
            <StatCard
              label="Contention Groups"
              value={conflictGroups.length}
              sublabel="Overlapping slot clusters"
              icon={<AlertTriangle className="h-4 w-4" />}
              accent="cyan"
            />
            <StatCard
              label="Confirmed Sessions"
              value={data.bookings.filter((b) => b.status === 'approved' || b.status === 'checked_in').length}
              sublabel="Active on campus schedules"
              icon={<CalendarCheck className="h-4 w-4" />}
              accent="emerald"
            />
            <StatCard
              label="Supervised Hardware"
              value={supervisedEq.length}
              sublabel="Active instruments"
              icon={<Cpu className="h-4 w-4" />}
              accent="blue"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Detected Slot Contention Groups</h2>
                <Link to="/faculty/allocation" className="text-xs text-[#22D3EE] hover:underline">
                  Resolve in Studio
                </Link>
              </div>

              {conflictGroups.length === 0 ? (
                <EmptyState
                  title="No active slot contentions"
                  description="No competing request clusters are queued. Open Conflict Resolution Studio to inspect or simulate schedules."
                  action={
                    <Link to="/faculty/allocation">
                      <Button size="sm" variant="secondary">Open Studio</Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {conflictGroups.map((g) => {
                    const eq = eqById.get(g.equipmentId);
                    return (
                      <Card
                        key={`${g.equipmentId}_${g.date}`}
                        padding="sm"
                        interactive
                        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-[#22D3EE]">{eq?.equipmentId ?? g.equipmentId}</span>
                            <span className="truncate text-sm font-semibold text-[#F8FAFC]">{eq?.name ?? g.equipmentId}</span>
                          </div>
                          <p className="mt-1 font-mono text-xs text-[#94A3B8] tabular-nums">
                            Date: {g.date} · {g.requestIds.length} competing requests
                          </p>
                        </div>
                        <Link to={`/faculty/allocation?eq=${g.equipmentId}&date=${g.date}`} className="shrink-0">
                          <Button size="sm">
                            Open Studio <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Recent Pending Queue</h2>
                <Link to="/faculty/requests" className="text-xs text-[#22D3EE] hover:underline">
                  View full queue
                </Link>
              </div>
              <Card className="space-y-2.5">
                {pendingReqs.slice(0, 6).map((req) => {
                  const eq = eqById.get(req.equipmentId);
                  const student = userById.get(req.studentId);
                  return (
                    <Link
                      key={req.id}
                      to={`/faculty/requests/${req.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#0D1424] p-2.5 transition-colors hover:border-[#3B82F6]/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#F8FAFC]">
                          {student?.displayName ?? req.studentId} · {eq?.equipmentId ?? req.equipmentId}
                        </p>
                        <p className="font-mono text-[11px] text-[#94A3B8] tabular-nums">
                          {req.requestedStart.slice(0, 16).replace('T', ' ')}–{req.requestedEnd.slice(11, 16)}
                        </p>
                      </div>
                      <StatusBadge status={req.status} />
                    </Link>
                  );
                })}
                {pendingReqs.length === 0 && <p className="text-xs text-[#64748B]">No pending requests in queue.</p>}
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
};
