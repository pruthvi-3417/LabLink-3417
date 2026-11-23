import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  Clock,
  Cpu,
  FolderKanban,
  Plus,
  Sparkles,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, DashboardSkeleton, EmptyState, StatCard, StatusBadge } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { DEFAULT_FAIR_USE_LIMIT_HOURS, DEMO_NOW, formatLocalIso } from '../../engine/constants';
import { computeUsedHoursInWindow } from '../../engine/scoring';

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const { data, loading } = useData();

  const myProjects = useMemo(
    () => (user ? data.projects.filter((p) => p.ownerId === user.uid) : []),
    [data.projects, user]
  );

  const myRequests = useMemo(
    () =>
      user
        ? data.bookingRequests
            .filter((r) => r.studentId === user.uid)
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        : [],
    [data.bookingRequests, user]
  );

  const myBookings = useMemo(
    () =>
      user
        ? data.bookings
            .filter((b) => b.studentId === user.uid)
            .sort((a, b) => b.start.localeCompare(a.start))
        : [],
    [data.bookings, user]
  );

  const myNotifications = useMemo(
    () => (user ? data.notifications.filter((n) => n.userId === user.uid).slice(0, 4) : []),
    [data.notifications, user]
  );

  const fairUseLimit =
    data.settings.find((s) => s.id === 'allocation')?.fairUseLimitHours ?? DEFAULT_FAIR_USE_LIMIT_HOURS;

  const refNow = user?.isDemo ? DEMO_NOW : formatLocalIso(Date.now());
  const usedHours = useMemo(
    () => (user ? computeUsedHoursInWindow(user.uid, data.usageLogs, refNow, 30) : 0),
    [user, data.usageLogs, refNow]
  );

  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);
  const projById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);

  const pendingCount = myRequests.filter((r) =>
    ['submitted', 'pending_approval', 'ai_recommended'].includes(r.status)
  ).length;
  const activeBookingsCount = myBookings.filter((b) => b.status === 'approved' || b.status === 'checked_in').length;
  const quotaPct = Math.min(100, Math.round((usedHours / Math.max(1, fairUseLimit)) * 100));

  return (
    <AppShell
      title={`Welcome, ${user?.displayName ?? 'Student'}`}
      subtitle="Manage academic projects, discover cross-department hardware, and track fair-use lab allocations."
      actions={
        <>
          <Link to="/student/projects/new">
            <Button variant="secondary" size="md">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </Link>
          <Link to="/student/equipment">
            <Button variant="primary" size="md">
              <Cpu className="h-4 w-4" />
              Explore Equipment
            </Button>
          </Link>
        </>
      }
    >
      {loading && data.equipment.length === 0 ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active Projects"
              value={myProjects.filter((p) => p.status === 'active').length}
              sublabel={`${myProjects.length} total registered`}
              icon={<FolderKanban className="h-4 w-4" />}
              accent="blue"
            />
            <StatCard
              label="Pending Requests"
              value={pendingCount}
              sublabel="Awaiting faculty conflict review"
              icon={<Clock className="h-4 w-4" />}
              accent="amber"
            />
            <StatCard
              label="Confirmed Sessions"
              value={activeBookingsCount}
              sublabel="Ready for QR lab check-in"
              icon={<CalendarCheck className="h-4 w-4" />}
              accent="emerald"
            />
            <Card className="flex flex-col justify-between gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#94A3B8]">30-Day Lab Usage</p>
                  <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums text-[#F8FAFC]">
                    {usedHours}h / {fairUseLimit}h
                  </p>
                </div>
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                    usedHours > fairUseLimit
                      ? 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20'
                      : 'text-[#22D3EE] bg-[#22D3EE]/10 border-[#22D3EE]/20'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usedHours > fairUseLimit ? 'bg-[#F59E0B]' : 'bg-[#22D3EE]'
                    }`}
                    style={{ width: `${quotaPct}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#64748B]">
                  {usedHours > fairUseLimit ? 'Exceeds fair-use threshold' : 'Within campus fair-use quota'}
                </p>
              </div>
            </Card>
          </div>

      {/* Main 2-Column Workspace */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent Booking Requests</h2>
            <Link to="/student/bookings" className="text-xs text-[#22D3EE] hover:underline">
              View all requests
            </Link>
          </div>

          {myRequests.length === 0 ? (
            <EmptyState
              title="No booking requests yet"
              description="Register an academic project with a deadline, then request lab equipment."
              action={
                <Link to="/student/equipment">
                  <Button size="sm">Browse Lab Inventory</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {myRequests.slice(0, 5).map((req) => {
                const eq = eqById.get(req.equipmentId);
                const proj = projById.get(req.projectId);
                return (
                  <Card key={req.id} padding="sm" className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#22D3EE]">{eq?.equipmentId ?? req.equipmentId}</span>
                        <span className="truncate text-sm font-semibold text-[#F8FAFC]">{eq?.name ?? 'Equipment'}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                        Project: {proj?.title ?? req.projectId} ·{' '}
                        <span className="font-mono tabular-nums">
                          {req.requestedStart.slice(0, 16).replace('T', ' ')}–{req.requestedEnd.slice(11, 16)}
                        </span>
                      </p>
                      {req.facultyNote && (
                        <p className="mt-1 text-[11px] text-[#CBD5E1]">Note: {req.facultyNote}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {typeof req.aiScore === 'number' && req.aiScore > 0 && (
                        <span className="font-mono text-xs font-semibold tabular-nums text-[#22D3EE]">
                          {req.aiScore} pts
                        </span>
                      )}
                      <StatusBadge status={req.status} />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">My Projects & Alerts</h2>
            <Link to="/student/projects" className="text-xs text-[#22D3EE] hover:underline">
              Manage projects
            </Link>
          </div>

          <Card className="space-y-3">
            {myProjects.slice(0, 3).map((proj) => (
              <Link
                key={proj.id}
                to={`/student/projects/${proj.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-[#0D1424] p-3 hover:border-[#3B82F6]/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#F8FAFC]">{proj.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#94A3B8]">
                    Deadline: {proj.deadline.slice(0, 10)} · {proj.category}
                  </p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
              </Link>
            ))}
            {myProjects.length === 0 && (
              <p className="text-xs text-[#94A3B8]">No projects registered yet.</p>
            )}
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-[#F8FAFC]">
                <Bell className="h-3.5 w-3.5 text-[#22D3EE]" /> Recent Notifications
              </span>
              <Link to="/student/notifications" className="text-[11px] text-[#22D3EE] hover:underline">
                View all
              </Link>
            </div>
            {myNotifications.length === 0 ? (
              <p className="text-xs text-[#64748B]">You are all caught up.</p>
            ) : (
              myNotifications.map((n) => (
                <div key={n.id} className="rounded-lg border border-white/[0.05] bg-[#0D1424] p-2.5 text-xs">
                  <p className="font-medium text-[#F8FAFC]">{n.title}</p>
                  <p className="mt-0.5 text-[11px] text-[#94A3B8]">{n.message}</p>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
        </>
      )}
    </AppShell>
  );
};

