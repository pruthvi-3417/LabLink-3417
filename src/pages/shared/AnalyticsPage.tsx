import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Info, Sparkles } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, EmptyState, Input, Select, SkeletonBlock, StatCard } from '../../components/ui/Primitives';
import { useData } from '../../context/DataContext';
import { computeAnalytics } from '../../data/analytics';
import type { EquipmentCategory } from '../../types/models';

const COLORS = ['#3B82F6', '#22D3EE', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];
const TOOLTIP_STYLE = {
  backgroundColor: '#0D1424',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#F8FAFC',
};

export const AnalyticsPage: React.FC = () => {
  const { data } = useData();

  const [startDate, setStartDate] = useState('2026-02-15');
  const [endDate, setEndDate] = useState('2026-03-10');
  const [departmentId, setDepartmentId] = useState('');
  const [category, setCategory] = useState('');
  const [laboratoryId, setLaboratoryId] = useState('');

  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsData, setInsightsData] = useState<{
    source: string;
    label: string;
    isDemo: boolean;
    insights: Array<{ title: string; body: string; metricKey: string; metricValue: string }>;
  } | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(data.equipment.map((e) => e.category))) as EquipmentCategory[],
    [data.equipment]
  );

  const analytics = useMemo(
    () =>
      computeAnalytics(data, {
        startDate,
        endDate,
        departmentId: departmentId || undefined,
        category: category || undefined,
        laboratoryId: laboratoryId || undefined,
      }),
    [data, startDate, endDate, departmentId, category, laboratoryId]
  );

  const fetchInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics: analytics.metricsForAi,
          isDemo: data.bookings.some((b) => b.isDemo),
        }),
      });
      const json = await res.json();
      setInsightsData(json);
    } catch {
      setInsightsData(null);
    } finally {
      setInsightsLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics.overallUtilizationPct, analytics.totalRequests]);

  const handleExportCsv = () => {
    const lines = [
      'DepartmentCode,DepartmentName,UtilizationPct,OccupiedHours,ConfirmedBookings',
      ...analytics.byDepartment.map(
        (d) => `${d.code},"${d.name}",${d.utilizationPct},${d.occupiedHours},${d.bookings}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lablink_analytics_${startDate}_to_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell
      title="Campus Resource Analytics"
      subtitle="Real-time utilization, cross-department sharing, maintenance impact, and contention metrics computed from stored records."
      actions={
        <Button variant="secondary" onClick={handleExportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      }
    >
      {/* Filters */}
      <Card padding="sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">All Departments</option>
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </Select>
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select label="Laboratory" value={laboratoryId} onChange={(e) => setLaboratoryId(e.target.value)}>
            <option value="">All Laboratories</option>
            {data.laboratories.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* KPI Row + Formula Tooltip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Overall Lab Utilization"
          value={`${analytics.overallUtilizationPct}%`}
          sublabel={`${analytics.occupiedHours}h occupied / ${analytics.availableOperatingHours}h avail`}
          accent="cyan"
        />
        <StatCard
          label="Cross-Department Share"
          value={`${analytics.crossDepartmentPct}%`}
          sublabel={`${analytics.totalConfirmedBookings} confirmed bookings`}
          accent="blue"
        />
        <StatCard
          label="Request Approval Rate"
          value={`${analytics.approvalRatePct}%`}
          sublabel={`${analytics.totalRequests} requests in range`}
          accent="emerald"
        />
        <StatCard
          label="Maintenance Events"
          value={analytics.totalMaintenanceEvents}
          sublabel="Scheduled & in-progress windows"
          accent="amber"
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#0D1424] px-3 py-2 text-xs text-[#94A3B8]">
        <Info className="h-4 w-4 shrink-0 text-[#22D3EE]" />
        <span>{analytics.utilizationFormula}</span>
      </div>

      {/* Grounded Gemini Insights */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]">
            <Sparkles className="h-4 w-4 text-[#22D3EE]" />
            <span>{insightsData?.label ?? 'Operational Insights'}</span>
            {insightsData?.isDemo && (
              <span className="rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] text-[#FCD34D]">
                Simulated Demo Dataset
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" loading={insightsLoading} onClick={fetchInsights}>
            Refresh Insights
          </Button>
        </div>
        {insightsLoading && !insightsData ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
            <SkeletonBlock className="h-24" />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {(insightsData?.insights ?? []).map((ins, i) => (
              <div key={i} className="rounded-lg border border-white/[0.08] bg-[#0D1424] p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#F8FAFC]">{ins.title}</span>
                  <span className="font-mono text-[#22D3EE] tabular-nums">{ins.metricValue}</span>
                </div>
                <p className="text-[#94A3B8]">{ins.body}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {analytics.totalRequests === 0 && analytics.totalConfirmedBookings === 0 ? (
        <EmptyState
          title="No activity in selected filter window"
          description="Adjust the date range, department, category, or laboratory filters to view utilization and demand charts."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDepartmentId('');
                setCategory('');
                setLaboratoryId('');
                setStartDate('2026-02-15');
                setEndDate('2026-03-10');
              }}
            >
              Reset Analytics Filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Utilization by Department (%)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byDepartment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="code" stroke="#94A3B8" fontSize={12} />
                  <YAxis stroke="#94A3B8" fontSize={12} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="utilizationPct" name="Utilization %" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Most Requested Equipment</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.mostRequestedEquipment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="code" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#94A3B8" fontSize={12} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="requests" name="Requests" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="approved" name="Approved" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Booking Demand Over Time</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.demandOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#94A3B8" fontSize={12} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Area type="monotone" dataKey="requests" name="Requests" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.25} />
                  <Area type="monotone" dataKey="bookings" name="Confirmed" stroke="#22D3EE" fill="#22D3EE" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Cross-Department vs Internal Bookings</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.crossDeptMatrix}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="department" stroke="#94A3B8" fontSize={12} />
                  <YAxis stroke="#94A3B8" fontSize={12} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="internal" stackId="a" name="Internal Dept" fill="#3B82F6" />
                  <Bar dataKey="crossDept" stackId="a" name="Cross-Dept Shared" fill="#22D3EE" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Request Status &amp; Equipment Availability</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.statusBreakdown} dataKey="value" nameKey="name" outerRadius={64} label>
                      {analytics.statusBreakdown.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.availabilityBreakdown} dataKey="value" nameKey="name" outerRadius={64} label>
                      {analytics.availabilityBreakdown.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[(idx + 2) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Maintenance Hours &amp; Conflict Trends</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.maintenanceFrequency}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="equipment" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#94A3B8" fontSize={12} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="hours" name="Maintenance Hours" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="events" name="Events" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
};
