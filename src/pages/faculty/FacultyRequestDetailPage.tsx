import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, EmptyState, ScoreRing, StatusBadge, Textarea } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { runAllocationEngine } from '../../engine/allocator';
import { DEMO_NOW, formatLocalIso } from '../../engine/constants';

export const FacultyRequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, pushToast } = useData();

  const request = data.bookingRequests.find((r) => r.id === id);
  const equipment = request ? data.equipment.find((e) => e.id === request.equipmentId) : undefined;
  const student = request ? data.users.find((u) => u.id === request.studentId) : undefined;
  const project = request ? data.projects.find((p) => p.id === request.projectId) : undefined;

  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const engineEntry = useMemo(() => {
    if (!request) return null;
    const nowIso = request.isDemo ? DEMO_NOW : formatLocalIso(Date.now());
    const allocSet = data.settings.find((s) => s.id === 'allocation');
    const result = runAllocationEngine(
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
        targetEquipmentId: request.equipmentId,
        targetDate: request.requestedStart.slice(0, 10),
      },
      nowIso
    );
    return result.entries.find((e) => e.requestId === request.id) ?? null;
  }, [data, request]);

  if (!request) {
    return (
      <AppShell title="Request Not Found">
        <EmptyState
          title="Booking request not found"
          description="Return to the requests queue."
          action={
            <Link to="/faculty/requests">
              <Button>Back to Queue</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  const isTerminal = ['approved', 'rejected', 'cancelled', 'completed'].includes(request.status);

  const handleApprove = async () => {
    if (!user || !equipment) return;
    const slot = engineEntry?.recommendedSlot ?? {
      start: request.requestedStart,
      end: request.requestedEnd,
      equipmentId: equipment.id,
      equipmentName: equipment.name,
    };
    setBusy(true);
    try {
      await repo.approveBookingRequest({
        requestId: request.id,
        facultyId: user.uid,
        slot,
        equipmentId: slot.equipmentId || equipment.id,
        isOverride: false,
        reason: reason.trim() || 'Approved from faculty request detail.',
        engineSnapshot: engineEntry
          ? {
              rank: engineEntry.rank,
              totalScore: engineEntry.scoreBreakdown?.total ?? 0,
              recommendedSlot: engineEntry.recommendedSlot,
            }
          : undefined,
      });
      pushToast({ title: 'Booking Confirmed', message: 'Transactional lock succeeded & QR pass issued.', tone: 'success' });
      navigate('/faculty/requests');
    } catch (err) {
      pushToast({ title: 'Approval Blocked', message: err instanceof Error ? err.message : 'Conflict error', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!user) return;
    if (reason.trim().length < 5) {
      pushToast({ title: 'Reason required', message: 'Provide a clear reason before rejecting.', tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await repo.facultyDecideOther({
        requestId: request.id,
        facultyId: user.uid,
        decision: 'rejected',
        reason: reason.trim(),
        isOverride: false,
      });
      pushToast({ title: 'Request Rejected', tone: 'info' });
      navigate('/faculty/requests');
    } catch (err) {
      pushToast({
        title: 'Rejection Failed',
        message: err instanceof Error ? err.message : 'Unable to reject request.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title={`Review Request · ${equipment?.equipmentId ?? request.equipmentId}`}
      subtitle={`${student?.displayName ?? request.studentId} · ${project?.title ?? request.projectId}`}
      actions={
        <>
          <Link to="/faculty/requests">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Queue
            </Button>
          </Link>
          <Link to={`/faculty/allocation?eq=${request.equipmentId}&date=${request.requestedStart.slice(0, 10)}`}>
            <Button variant="primary" size="sm">
              Open in Conflict Studio
            </Button>
          </Link>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Request &amp; Constraint Audit</h2>
            <StatusBadge status={request.status} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-lg border border-white/[0.06] bg-[#0D1424] p-3">
              <span className="text-[#64748B]">Requested Window</span>
              <p className="mt-1 font-mono text-[#F8FAFC] tabular-nums">
                {request.requestedStart.slice(0, 16).replace('T', ' ')} – {request.requestedEnd.slice(11, 16)}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-[#0D1424] p-3">
              <span className="text-[#64748B]">Project Deadline</span>
              <p className="mt-1 font-mono text-[#22D3EE] tabular-nums">
                {project?.deadline.slice(0, 16).replace('T', ' ') ?? 'Unknown'}
              </p>
            </div>
          </div>

          {request.purpose && (
            <div className="rounded-lg border border-white/[0.06] bg-[#0D1424] p-3 text-xs">
              <span className="text-[#64748B]">Workload Purpose</span>
              <p className="mt-1 text-[#CBD5E1]">{request.purpose}</p>
            </div>
          )}

          {engineEntry && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                12 Hard Constraint Checks
              </h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {engineEntry.constraintChecks.map((c) => (
                  <div
                    key={c.code}
                    className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-[11px] ${
                      c.passed
                        ? 'border-[#10B981]/25 bg-[#10B981]/5 text-[#6EE7B7]'
                        : 'border-[#EF4444]/35 bg-[#EF4444]/10 text-[#FCA5A5]'
                    }`}
                  >
                    {c.passed ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate font-mono">{c.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Engine Evaluation</h2>
              <p className="text-xs text-[#94A3B8]">
                {engineEntry?.rank ? `Ranked #${engineEntry.rank} in conflict group` : 'Eligibility / Slot Summary'}
              </p>
            </div>
            {engineEntry?.scoreBreakdown && <ScoreRing score={engineEntry.scoreBreakdown.total} />}
          </div>

          {engineEntry?.recommendedSlot && (
            <div className="rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 p-3 text-xs text-[#67E8F9]">
              Recommended Slot: {engineEntry.recommendedSlot.start.slice(0, 16).replace('T', ' ')}–
              {engineEntry.recommendedSlot.end.slice(11, 16)}
            </div>
          )}

          {!isTerminal && (
            <div className="space-y-3 border-t border-white/[0.08] pt-3">
              <Textarea
                label="Faculty Decision Note"
                rows={3}
                placeholder="Reason for approval, alternative suggestion, or rejection..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" loading={busy} onClick={handleApprove}>
                  Approve Recommended Slot
                </Button>
                <Button variant="danger" loading={busy} onClick={handleReject}>
                  Reject Request
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
};
