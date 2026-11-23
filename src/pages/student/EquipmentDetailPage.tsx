import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  CheckCircle2,
  Compass,
  Image as ImageIcon,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { BookingCalendar } from '../../components/BookingCalendar';
import { EquipmentCard } from '../../components/EquipmentCard';
import { AppImage, resolveEquipmentImage } from '../../components/ui/AppImage';
import {
  Button,
  Card,
  EmptyState,
  GlassPanel,
  Input,
  Select,
  StatusBadge,
  Tabs,
  Textarea,
} from '../../components/ui/Primitives';
import { getDepartmentTheme } from '../../config/departmentThemes';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { COMPATIBLE_CATEGORIES, DEMO_NOW, DEMO_SCENARIO_DAY, formatLocalIso } from '../../engine/constants';
import { bookingsToIntervals, evaluateHardConstraints } from '../../engine/constraints';
import { bookingRequestSchema } from '../../schemas/validation';

const Equipment3DViewer = lazy(() => import('../../components/three/Equipment3DViewer'));

export const EquipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, pushToast } = useData();

  const equipment = data.equipment.find((e) => e.id === id || e.equipmentId === id);
  const lab = equipment ? data.laboratories.find((l) => l.id === equipment.laboratoryId) : undefined;
  const dept = equipment ? data.departments.find((d) => d.id === equipment.departmentId) : undefined;
  const faculty = equipment ? data.users.find((u) => u.id === equipment.responsibleFacultyId) : undefined;
  const deptTheme = getDepartmentTheme(equipment?.departmentId);

  const [viewTab, setViewTab] = useState<'3d' | 'photo'>('photo');
  const [detailTab, setDetailTab] = useState<'overview' | 'safety' | 'timeline' | 'alternatives'>('overview');

  const myProjects = useMemo(
    () => (user ? data.projects.filter((p) => p.ownerId === user.uid && p.status === 'active') : []),
    [data.projects, user]
  );

  const [projectId, setProjectId] = useState(myProjects[0]?.id ?? '');
  const [date, setDate] = useState(DEMO_SCENARIO_DAY);
  const [startTime, setStartTime] = useState('11:00');
  const [endTime, setEndTime] = useState('13:00');
  const [units, setUnits] = useState(1);
  const [purpose, setPurpose] = useState('');
  const [requiredCuda, setRequiredCuda] = useState(Boolean(equipment?.specs.cuda));
  const [requiredVramGB, setRequiredVramGB] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setViewTab('photo');
    setRequiredCuda(Boolean(equipment?.specs.cuda));
    setRequiredVramGB('');
    setUnits(1);
    setSubmitError(null);
  }, [equipment?.id, equipment?.specs.cuda]);

  useEffect(() => {
    if (!myProjects.some((p) => p.id === projectId)) {
      setProjectId(myProjects[0]?.id ?? '');
    }
  }, [myProjects, projectId]);

  const requestedStart = `${date}T${startTime}:00`;
  const requestedEnd = `${date}T${endTime}:00`;

  const selectedProject = myProjects.find((p) => p.id === (projectId || myProjects[0]?.id));

  const liveChecks = useMemo(() => {
    if (!equipment || !user) return [];
    const draftReq = {
      id: 'preview',
      studentId: user.uid,
      projectId: selectedProject?.id ?? '',
      equipmentId: equipment.id,
      departmentId: equipment.departmentId,
      requestedStart,
      requestedEnd,
      units,
      requiredSpecs: {
        ...(requiredCuda ? { cuda: true } : {}),
        ...(requiredVramGB ? { vramGB: Number(requiredVramGB) } : {}),
      },
      status: 'pending_approval' as const,
      submittedAt: user.isDemo ? DEMO_NOW : formatLocalIso(Date.now()),
      isDemo: user.isDemo,
      createdAt: DEMO_NOW,
      updatedAt: DEMO_NOW,
    };
    return evaluateHardConstraints({
      request: draftReq,
      equipment,
      laboratory: lab,
      project: selectedProject,
      student: user,
      confirmedIntervals: bookingsToIntervals(data.bookings, equipment.id),
      maintenanceRecords: data.maintenance,
      nowIso: user.isDemo ? DEMO_NOW : formatLocalIso(Date.now()),
    });
  }, [
    equipment,
    user,
    selectedProject,
    requestedStart,
    requestedEnd,
    units,
    requiredCuda,
    requiredVramGB,
    data.bookings,
    data.maintenance,
    lab,
  ]);

  const failedChecks = liveChecks.filter((c) => !c.passed);

  const compatibleAlternatives = useMemo(() => {
    if (!equipment) return [];
    const compat = COMPATIBLE_CATEGORIES[equipment.category] ?? [equipment.category];
    return data.equipment
      .filter(
        (e) =>
          e.id !== equipment.id &&
          e.isActive &&
          e.maintenanceStatus !== 'under_maintenance' &&
          compat.includes(e.category)
      )
      .slice(0, 3);
  }, [data.equipment, equipment]);

  const recentUsageLogs = useMemo(
    () =>
      equipment
        ? data.usageLogs
            .filter((u) => u.equipmentId === equipment.id)
            .sort((a, b) => b.start.localeCompare(a.start))
            .slice(0, 5)
        : [],
    [data.usageLogs, equipment]
  );

  const activeMaintenance = useMemo(
    () =>
      equipment
        ? data.maintenance.filter((m) => m.equipmentId === equipment.id && m.status !== 'completed')
        : [],
    [data.maintenance, equipment]
  );

  if (!equipment) {
    return (
      <AppShell title="Equipment Not Found" tier="C">
        <EmptyState
          title="Resource not found"
          description="The requested laboratory instrument does not exist in inventory."
          action={
            <Link to="/student/equipment">
              <Button>Back to Explore</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  const resolvedImg = resolveEquipmentImage(equipment);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitError(null);

    const activeProjId = projectId || myProjects[0]?.id || '';
    const parsed = bookingRequestSchema.safeParse({
      projectId: activeProjId,
      equipmentId: equipment.id,
      requestedStart,
      requestedEnd,
      units,
      purpose,
      requiredCuda,
      requiredVramGB: requiredVramGB ? Number(requiredVramGB) : undefined,
    });

    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message || 'Check booking request fields.');
      return;
    }

    setSubmitting(true);
    try {
      await repo.submitBookingRequest(
        {
          studentId: user.uid,
          projectId: activeProjId,
          equipmentId: equipment.id,
          departmentId: equipment.departmentId,
          requestedStart,
          requestedEnd,
          units,
          purpose: purpose.trim() || undefined,
          requiredSpecs: {
            ...(requiredCuda ? { cuda: true } : {}),
            ...(requiredVramGB ? { vramGB: Number(requiredVramGB) } : {}),
          },
          isDemo: user.isDemo,
        },
        equipment.responsibleFacultyId
      );
      pushToast({
        title: 'Request Submitted',
        message: `${equipment.equipmentId} queued for faculty review & priority scoring.`,
        tone: 'success',
      });
      navigate('/student/bookings');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit booking request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title={equipment.name}
      subtitle={`${equipment.equipmentId} · ${equipment.category} · ${dept?.name ?? equipment.departmentId}`}
      tier="B"
      backdropImageSlot="campus/dusk-wide"
      departmentId={equipment.departmentId}
      actions={
        <>
          <Link to={`/student/campus?equipment=${equipment.id}`}>
            <Button variant="secondary" size="sm">
              <Compass className="h-3.5 w-3.5 text-[#22D3EE]" />
              Locate in 3D Campus
            </Button>
          </Link>
          <Link to="/student/equipment">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              All Equipment
            </Button>
          </Link>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left: Media + 4 Tabbed Details */}
        <div className="lg:col-span-7 space-y-5">
          <GlassPanel padding="sm" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={!equipment.isActive ? 'inactive' : equipment.maintenanceStatus} />
                <span
                  className="rounded-md border border-white/10 bg-[#0B1220] px-2 py-0.5 font-mono text-[11px]"
                  style={{ color: deptTheme.accent2 }}
                >
                  {dept?.code ?? deptTheme.code} · {equipment.equipmentId}
                </span>
              </div>

              <div className="flex gap-1 rounded-lg border border-white/10 bg-[#0B1220] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewTab('photo')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 cursor-pointer transition-colors ${
                    viewTab === 'photo' ? 'bg-[#17243A] text-[#F8FAFC]' : 'text-[#94A3B8]'
                  }`}
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Studio Photo
                </button>
                <button
                  type="button"
                  onClick={() => setViewTab('3d')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 cursor-pointer transition-colors ${
                    viewTab === '3d' ? 'bg-[#17243A] text-[#22D3EE]' : 'text-[#94A3B8]'
                  }`}
                >
                  <Box className="h-3.5 w-3.5" /> Interactive 3D
                </button>
              </div>
            </div>

            <div className="h-72 sm:h-80 overflow-hidden rounded-xl border border-white/[0.06] bg-[#070B14]">
              {viewTab === '3d' ? (
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-xs text-[#94A3B8]">
                      Initializing 3D instrument rig...
                    </div>
                  }
                >
                  <Equipment3DViewer
                    category={equipment.category}
                    equipment={equipment}
                    accent={deptTheme.accent}
                  />
                </Suspense>
              ) : (
                <AppImage
                  src={resolvedImg.src}
                  focalPoint={resolvedImg.focalPoint}
                  alt={equipment.name}
                  category={equipment.category}
                  departmentId={equipment.departmentId}
                  scrim="bottom"
                  className="h-full w-full"
                />
              )}
            </div>
          </GlassPanel>

          {/* 4 Clean Tabs */}
          <Tabs
            activeId={detailTab}
            onChange={(next) => setDetailTab(next as typeof detailTab)}
            items={[
              { id: 'overview', label: 'Overview & Specs' },
              { id: 'safety', label: 'Restrictions & Safety', count: activeMaintenance.length },
              { id: 'timeline', label: 'Availability Timeline' },
              { id: 'alternatives', label: 'Usage & Alternatives', count: compatibleAlternatives.length },
            ]}
          />

          {detailTab === 'overview' && (
            <Card className="space-y-5">
              <p className="text-sm leading-relaxed text-[#CBD5E1]">{equipment.description}</p>

              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <div className="rounded-lg border border-white/[0.06] bg-[#0B1220] p-3">
                  <span className="text-[#64748B]">Laboratory &amp; Location</span>
                  <p className="mt-1 font-medium text-[#F8FAFC]">{lab?.name ?? equipment.building}</p>
                  <p className="text-[#94A3B8]">{equipment.location}</p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#0B1220] p-3">
                  <span className="text-[#64748B]">Operating Hours &amp; Caps</span>
                  <p className="mt-1 font-mono font-medium text-[#F8FAFC] tabular-nums">
                    {lab?.openHour ?? '09:00'}–{lab?.closeHour ?? '18:00'}
                  </p>
                  <p className="font-mono text-[#94A3B8] tabular-nums">
                    {equipment.minBookingMins}–{equipment.maxBookingMins} mins · {equipment.quantity} unit(s)
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#0B1220] p-3">
                  <span className="text-[#64748B]">Faculty Supervisor</span>
                  <p className="mt-1 font-medium text-[#F8FAFC]">{faculty?.displayName ?? 'Lab Coordinator'}</p>
                  <p className="text-[#94A3B8]">Split booking: {equipment.allowsSplitBooking ? 'Allowed' : 'No'}</p>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Technical Specifications
                </h3>
                <div className="grid divide-y divide-white/[0.06] rounded-lg border border-white/[0.06] bg-[#0B1220] sm:grid-cols-2 sm:divide-y-0">
                  {Object.entries(equipment.specs).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3.5 py-2.5 text-xs last:border-b-0"
                    >
                      <span className="text-[#94A3B8]">{k}</span>
                      <span className="font-mono font-semibold tabular-nums text-[#22D3EE]">
                        {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {detailTab === 'safety' && (
            <Card className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border border-white/[0.06] bg-[#0B1220] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Certification Gate</span>
                  <p className="font-semibold text-[#F8FAFC]">
                    {equipment.requiresCertification
                      ? `Required: ${equipment.requiredCertification ?? 'Lab Safety Credential'}`
                      : 'Open Campus Access (No specialized cert required)'}
                  </p>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-[#0B1220] p-3.5 space-y-1">
                  <span className="text-[#64748B]">Allocation Policy</span>
                  <p className="font-semibold text-[#F8FAFC]">
                    {equipment.minBookingMins}m minimum · {equipment.maxBookingMins}m cap ·{' '}
                    {equipment.allowsSplitBooking ? 'Split units permitted' : 'Single group lock'}
                  </p>
                </div>
              </div>

              {(equipment.usageRestrictions || equipment.requiresCertification) && (
                <div className="rounded-lg border border-[#F59E0B]/35 bg-[#F59E0B]/10 p-3.5 text-xs text-[#FDE68A] flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {equipment.requiresCertification && (
                      <p className="font-semibold">
                        Certification required: {equipment.requiredCertification}
                      </p>
                    )}
                    {equipment.usageRestrictions && <p className="mt-0.5">{equipment.usageRestrictions}</p>}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Maintenance &amp; Calibration Windows
                </h3>
                {activeMaintenance.length === 0 ? (
                  <p className="rounded-lg border border-white/[0.06] bg-[#0B1220] p-3 text-xs text-[#94A3B8]">
                    No upcoming maintenance blocks scheduled for this instrument.
                  </p>
                ) : (
                  activeMaintenance.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-[#F59E0B]/30 bg-[#0B1220] p-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-[#FCD34D] shrink-0" />
                        <div>
                          <p className="font-medium text-[#F8FAFC]">{m.title}</p>
                          <p className="font-mono text-[11px] text-[#94A3B8] tabular-nums">
                            {m.start.slice(0, 16).replace('T', ' ')} → {m.end.slice(0, 16).replace('T', ' ')}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={m.status} />
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {detailTab === 'timeline' && (
            <Card className="space-y-3">
              <h2 className="font-display text-base font-semibold">Live Availability &amp; Maintenance Timeline</h2>
              <BookingCalendar
                equipment={equipment}
                laboratory={lab}
                bookings={data.bookings}
                pendingRequests={data.bookingRequests}
                maintenance={data.maintenance}
                onSelectSlot={(slot) => {
                  setDate(slot.start.slice(0, 10));
                  setStartTime(slot.start.slice(11, 16));
                  setEndTime(slot.end.slice(11, 16));
                }}
              />
            </Card>
          )}

          {detailTab === 'alternatives' && (
            <div className="space-y-5">
              <Card className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Recent Logged Sessions ({recentUsageLogs.length})
                </h3>
                {recentUsageLogs.length === 0 ? (
                  <p className="text-xs text-[#94A3B8]">No completed usage logs recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {recentUsageLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#0B1220] px-3 py-2 text-xs"
                      >
                        <span className="font-mono text-[#CBD5E1] tabular-nums">
                          {log.start.slice(0, 16).replace('T', ' ')}–{log.end.slice(11, 16)}
                        </span>
                        <span className="font-mono text-[#22D3EE] tabular-nums">{log.hours}h logged</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {compatibleAlternatives.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-display text-base font-semibold text-[#F8FAFC]">
                    Compatible Campus Alternatives
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {compatibleAlternatives.map((alt) => (
                      <EquipmentCard
                        key={alt.id}
                        equipment={alt}
                        detailHref={`/student/equipment/${alt.id}`}
                        department={data.departments.find((d) => d.id === alt.departmentId)}
                        laboratory={data.laboratories.find((l) => l.id === alt.laboratoryId)}
                        actionLabel="Inspect Alternative"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Sticky Request Card + Live 12-Constraint Pre-check */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-5">
          <GlassPanel padding="md" className="space-y-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">Request Access</h2>
              <p className="mt-0.5 text-xs text-[#94A3B8]">
                Validated live against all 12 hard constraints and routed to faculty review.
              </p>
            </div>

            {myProjects.length === 0 ? (
              <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4 text-xs text-[#FDE68A] space-y-3">
                <p className="font-semibold">Project Registration Required</p>
                <p>
                  LabLink requires every hardware booking request to link to an active academic project with a
                  verifiable deadline.
                </p>
                <Link to="/student/projects/new">
                  <Button size="sm">Create Project First</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <Select
                  label="Linked Academic Project"
                  value={projectId || myProjects[0]?.id}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  {myProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (Due {p.deadline.slice(0, 10)})
                    </option>
                  ))}
                </Select>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label="Date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                  <Input
                    label="Start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                  <Input
                    label="End"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label={`Units (max ${equipment.quantity})`}
                    type="number"
                    min={1}
                    max={Math.max(1, equipment.quantity)}
                    value={units}
                    onChange={(e) => setUnits(Number(e.target.value) || 1)}
                  />
                  <Input
                    label="Min VRAM GB (optional)"
                    type="number"
                    min={0}
                    placeholder="e.g., 24"
                    value={requiredVramGB}
                    onChange={(e) => setRequiredVramGB(e.target.value)}
                  />
                </div>

                {equipment.specs.cuda !== undefined && (
                  <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requiredCuda}
                      onChange={(e) => setRequiredCuda(e.target.checked)}
                    />
                    Requires CUDA support for workload
                  </label>
                )}

                <Textarea
                  label="Experiment / Workload Purpose"
                  rows={2}
                  placeholder="Describe experiment, dataset, or safety setup..."
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />

                {/* Live Constraint Pre-check */}
                <div
                  className={`rounded-lg border p-3 text-xs space-y-1.5 ${
                    failedChecks.length === 0
                      ? 'border-[#10B981]/30 bg-[#10B981]/10 text-[#6EE7B7]'
                      : 'border-[#F59E0B]/35 bg-[#F59E0B]/10 text-[#FDE68A]'
                  }`}
                >
                  {failedChecks.length === 0 ? (
                    <div className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Passes all 12 hard constraints for {date} {startTime}–{endTime}.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Constraint Warning ({failedChecks.length})
                      </div>
                      {failedChecks.map((fc) => (
                        <p key={fc.code} className="text-[11px]">
                          • {fc.code}: {fc.detail}
                        </p>
                      ))}
                    </>
                  )}
                </div>

                {submitError && <p className="text-xs text-[#FCA5A5]">{submitError}</p>}

                <Button type="submit" size="lg" className="w-full" loading={submitting}>
                  Submit Booking Request
                </Button>
              </form>
            )}
          </GlassPanel>
        </div>
      </div>
    </AppShell>
  );
};
