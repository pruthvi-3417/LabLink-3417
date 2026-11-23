import React, { Suspense, lazy, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Building2, CalendarCheck, Cpu, Shield, Users, Wrench } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, DashboardSkeleton, SkeletonBlock, StatCard } from '../../components/ui/Primitives';
import { useData } from '../../context/DataContext';
import { computeAnalytics } from '../../data/analytics';

const CampusNetworkGraph = lazy(() => import('../../components/three/CampusNetworkGraph'));

export const AdminDashboard: React.FC = () => {
  const { data, loading } = useData();

  const analytics = useMemo(
    () =>
      computeAnalytics(data, {
        startDate: '2026-02-15',
        endDate: '2026-03-10',
      }),
    [data]
  );

  const networkData = useMemo(() => {
    const deptsById = new Map(data.departments.map((d) => [d.id, d]));
    const deptUtilMap = new Map(analytics.byDepartment.map((d) => [d.departmentId, d.utilizationPct]));
    const labs = data.laboratories.map((lab) => ({
      id: lab.id,
      name: lab.name,
      departmentCode: deptsById.get(lab.departmentId)?.code ?? 'LAB',
      utilizationPct: deptUtilMap.get(lab.departmentId) ?? 0,
      equipmentCount: data.equipment.filter((e) => e.laboratoryId === lab.id).length,
    }));

    // Build cross-department edges based on confirmed bookings across student dept vs equipment dept
    const userById = new Map(data.users.map((u) => [u.id, u]));
    const eqById = new Map(data.equipment.map((e) => [e.id, e]));
    const linksMap = new Map<string, { fromLabId: string; toLabId: string; weight: number }>();

    for (const bk of data.bookings) {
      const student = userById.get(bk.studentId);
      const eq = eqById.get(bk.equipmentId);
      if (!student || !eq) continue;
      const homeLab = data.laboratories.find((l) => l.departmentId === student.departmentId);
      if (!homeLab || homeLab.id === eq.laboratoryId) continue;
      const k = `${homeLab.id}__${eq.laboratoryId}`;
      const existing = linksMap.get(k);
      if (existing) existing.weight += 1;
      else linksMap.set(k, { fromLabId: homeLab.id, toLabId: eq.laboratoryId, weight: 1 });
    }

    return { labs, links: Array.from(linksMap.values()) };
  }, [data, analytics]);

  const pendingRoleReqs = data.roleRequests.filter((r) => r.status === 'pending').length;
  const activeMaint = data.maintenance.filter((m) => m.status === 'scheduled' || m.status === 'in_progress').length;

  return (
    <AppShell
      title="Campus Administration Overview"
      subtitle="Unified infrastructure monitoring, utilization telemetry, and governance."
      actions={
        <>
          <Link to="/admin/equipment/new">
            <Button variant="primary" size="md">
              Add Equipment
            </Button>
          </Link>
          <Link to="/admin/analytics">
            <Button variant="secondary" size="md">
              <Activity className="h-4 w-4" />
              Analytics
            </Button>
          </Link>
        </>
      }
    >
      {loading && data.equipment.length === 0 ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Hardware Assets"
              value={data.equipment.length}
              sublabel={`${data.equipment.filter((e) => e.isActive).length} active across ${data.laboratories.length} labs`}
              icon={<Cpu className="h-4 w-4" />}
              accent="blue"
            />
            <StatCard
              label="Campus Utilization"
              value={`${analytics.overallUtilizationPct}%`}
              sublabel={`${analytics.occupiedHours}h / ${analytics.availableOperatingHours}h operating`}
              icon={<Activity className="h-4 w-4" />}
              accent="cyan"
            />
            <StatCard
              label="Cross-Department Share"
              value={`${analytics.crossDepartmentPct}%`}
              sublabel={`${analytics.totalConfirmedBookings} confirmed bookings`}
              icon={<Building2 className="h-4 w-4" />}
              accent="emerald"
            />
            <StatCard
              label="Governance Queue"
              value={pendingRoleReqs + activeMaint}
              sublabel={`${pendingRoleReqs} role req · ${activeMaint} maint windows`}
              icon={<Shield className="h-4 w-4" />}
              accent="amber"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold">Live 3D Campus Lab Network</h2>
                  <p className="text-xs text-[#94A3B8]">
                    Node radius reflects computed department utilization; links show cross-department bookings.
                  </p>
                </div>
                <Link to="/admin/labs" className="shrink-0 text-xs text-[#22D3EE] hover:underline">
                  Manage Labs
                </Link>
              </div>
              <Suspense fallback={<SkeletonBlock className="h-72 w-full" />}>
                <CampusNetworkGraph labs={networkData.labs} links={networkData.links} />
              </Suspense>
            </Card>

            <Card className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Recent Audit Trail</h2>
                <Link to="/admin/settings" className="text-xs text-[#22D3EE] hover:underline">
                  Settings
                </Link>
              </div>
              {data.auditLogs.length === 0 ? (
                <p className="text-xs text-[#64748B]">No audit events recorded yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {data.auditLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-lg border border-white/[0.06] bg-[#0D1424] p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-[#22D3EE] truncate">{log.action}</span>
                        <span className="font-mono text-[10px] text-[#64748B] tabular-nums shrink-0">
                          {log.createdAt.slice(0, 16).replace('T', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-[#CBD5E1]">{log.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/admin/bookings">
              <Card padding="sm" interactive className="flex items-center gap-3">
                <CalendarCheck className="h-5 w-5 text-[#22D3EE] shrink-0" />
                <div className="text-xs min-w-0">
                  <p className="font-semibold text-[#F8FAFC] truncate">QR Check-In &amp; Bookings</p>
                  <p className="text-[#94A3B8] truncate">Verify passes &amp; log hours</p>
                </div>
              </Card>
            </Link>
            <Link to="/admin/maintenance">
              <Card padding="sm" interactive className="flex items-center gap-3">
                <Wrench className="h-5 w-5 text-[#F59E0B] shrink-0" />
                <div className="text-xs min-w-0">
                  <p className="font-semibold text-[#F8FAFC] truncate">Maintenance Scheduler</p>
                  <p className="text-[#94A3B8] truncate">Flag overlapping sessions</p>
                </div>
              </Card>
            </Link>
            <Link to="/admin/users">
              <Card padding="sm" interactive className="flex items-center gap-3">
                <Users className="h-5 w-5 text-[#8B5CF6] shrink-0" />
                <div className="text-xs min-w-0">
                  <p className="font-semibold text-[#F8FAFC] truncate">Users &amp; Role Requests</p>
                  <p className="text-[#94A3B8] truncate">{pendingRoleReqs} pending review</p>
                </div>
              </Card>
            </Link>
            <Link to="/admin/departments">
              <Card padding="sm" interactive className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-[#10B981] shrink-0" />
                <div className="text-xs min-w-0">
                  <p className="font-semibold text-[#F8FAFC] truncate">Departments</p>
                  <p className="text-[#94A3B8] truncate">{data.departments.length} engineering units</p>
                </div>
              </Card>
            </Link>
          </div>
        </>
      )}
    </AppShell>
  );
};
