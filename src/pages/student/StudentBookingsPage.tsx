import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { AlertTriangle, Clock, QrCode, XCircle } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  StatusBadge,
  Tabs,
} from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import type { Booking, BookingRequest } from '../../types/models';

export const StudentBookingsPage: React.FC = () => {
  const { user } = useAuth();
  const { data, pushToast } = useData();

  const [tab, setTab] = useState<'requests' | 'confirmed' | 'waitlist' | 'history'>('requests');
  const [qrModal, setQrModal] = useState<{ booking: Booking; dataUrl: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<{ kind: 'request' | 'booking'; id: string; label: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);
  const projById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);

  const myRequests = useMemo(
    () =>
      user
        ? data.bookingRequests
            .filter((r) => r.studentId === user.uid)
            .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        : [],
    [data.bookingRequests, user]
  );

  const activeRequests = myRequests.filter((r) =>
    ['draft', 'submitted', 'pending_approval', 'ai_recommended'].includes(r.status)
  );
  const pastRequests = myRequests.filter((r) => ['rejected', 'cancelled', 'completed'].includes(r.status));

  const myBookings = useMemo(
    () =>
      user
        ? data.bookings
            .filter((b) => b.studentId === user.uid)
            .sort((a, b) => b.start.localeCompare(a.start))
        : [],
    [data.bookings, user]
  );

  const confirmedBookings = myBookings.filter((b) => b.status === 'approved' || b.status === 'checked_in');
  const myWaitlist = useMemo(
    () => (user ? data.waitlists.filter((w) => w.studentId === user.uid) : []),
    [data.waitlists, user]
  );

  const openQrPass = async (bk: Booking) => {
    const token = bk.qrToken || `LABLINK-QR-${bk.id}`;
    const url = await QRCode.toDataURL(token, { width: 220, margin: 2 });
    setQrModal({ booking: bk, dataUrl: url });
  };

  const handleConfirmCancel = async () => {
    if (!confirmCancel || !user) return;
    setBusy(true);
    try {
      if (confirmCancel.kind === 'request') {
        await repo.cancelBookingRequest(confirmCancel.id, user.uid);
      } else {
        await repo.cancelBooking(confirmCancel.id, user.uid, user.role);
      }
      pushToast({ title: 'Cancelled', message: `${confirmCancel.label} cancelled and slot released.`, tone: 'info' });
      setConfirmCancel(null);
    } catch (err) {
      pushToast({
        title: 'Cancellation Failed',
        message: err instanceof Error ? err.message : 'Unable to cancel.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleJoinWaitlist = async (req: BookingRequest) => {
    if (!user) return;
    if (req.status === 'waitlisted' || myWaitlist.some((w) => w.requestId === req.id && w.status === 'waiting')) {
      setTab('waitlist');
      return;
    }
    setBusy(true);
    try {
      await repo.joinWaitlist({
        requestId: req.id,
        studentId: user.uid,
        equipmentId: req.equipmentId,
        desiredStart: req.requestedStart,
        desiredEnd: req.requestedEnd,
        isDemo: user.isDemo,
      });
      pushToast({ title: 'Waitlist Joined', message: 'Ranked by your 30-day fairness score.', tone: 'success' });
      setTab('waitlist');
    } catch (err) {
      pushToast({ title: 'Error', message: err instanceof Error ? err.message : 'Could not join waitlist.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="My Bookings & Requests"
      subtitle="Track faculty review status, view QR check-in passes, and manage waitlisted slots."
      actions={
        <Link to="/student/equipment">
          <Button variant="primary">New Request</Button>
        </Link>
      }
    >
      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
        items={[
          { id: 'requests', label: 'Pending Requests', count: activeRequests.length },
          { id: 'confirmed', label: 'Confirmed Sessions', count: confirmedBookings.length },
          { id: 'waitlist', label: 'Waitlist', count: myWaitlist.length },
          { id: 'history', label: 'Past & Rejected', count: pastRequests.length + myBookings.filter((b) => b.status === 'completed' || b.status === 'cancelled').length },
        ]}
      />

      {tab === 'requests' && (
        <div className="space-y-3">
          {activeRequests.length === 0 ? (
            <EmptyState
              title="No pending requests"
              description="Submit a new hardware request from the equipment explorer."
              action={
                <Link to="/student/equipment">
                  <Button size="sm">Explore Equipment</Button>
                </Link>
              }
            />
          ) : (
            activeRequests.map((req) => {
              const eq = eqById.get(req.equipmentId);
              const proj = projById.get(req.projectId);
              return (
                <Card key={req.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[#22D3EE]">{eq?.equipmentId ?? req.equipmentId}</span>
                      <span className="text-sm font-semibold text-[#F8FAFC]">{eq?.name ?? req.equipmentId}</span>
                      <StatusBadge status={req.status} />
                    </div>
                    <p className="text-xs text-[#94A3B8]">
                      Project: {proj?.title ?? req.projectId} ·{' '}
                      <span className="font-mono tabular-nums">
                        {req.requestedStart.slice(0, 16).replace('T', ' ')}–{req.requestedEnd.slice(11, 16)}
                      </span>
                    </p>
                    {req.aiRecommendedSlot && (
                      <p className="text-xs text-[#67E8F9]">
                        Suggested alternative: {req.aiRecommendedSlot.start.slice(0, 16).replace('T', ' ')}–
                        {req.aiRecommendedSlot.end.slice(11, 16)}
                      </p>
                    )}
                    {req.facultyNote && <p className="text-xs text-[#CBD5E1]">Faculty note: {req.facultyNote}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleJoinWaitlist(req)}
                      disabled={
                        busy ||
                        req.status === 'waitlisted' ||
                        myWaitlist.some((w) => w.requestId === req.id && w.status === 'waiting')
                      }
                    >
                      <Clock className="h-3.5 w-3.5" />{' '}
                      {req.status === 'waitlisted' || myWaitlist.some((w) => w.requestId === req.id && w.status === 'waiting')
                        ? 'Waitlisted'
                        : 'Waitlist'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setConfirmCancel({
                          kind: 'request',
                          id: req.id,
                          label: eq?.name ?? req.equipmentId,
                        })
                      }
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'confirmed' && (
        <div className="space-y-3">
          {confirmedBookings.length === 0 ? (
            <EmptyState
              title="No confirmed bookings"
              description="Once faculty approve your request, your QR lab pass will appear here."
            />
          ) : (
            confirmedBookings.map((bk) => {
              const eq = eqById.get(bk.equipmentId);
              const proj = projById.get(bk.projectId);
              return (
                <Card key={bk.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[#22D3EE]">{eq?.equipmentId ?? bk.equipmentId}</span>
                      <span className="text-sm font-semibold text-[#F8FAFC]">{eq?.name ?? bk.equipmentId}</span>
                      <StatusBadge status={bk.status} />
                    </div>
                    <p className="text-xs text-[#94A3B8]">
                      {proj?.title ?? bk.projectId} ·{' '}
                      <span className="font-mono tabular-nums">
                        {bk.start.slice(0, 16).replace('T', ' ')}–{bk.end.slice(11, 16)}
                      </span>{' '}
                      · {eq?.location}
                    </p>
                    {bk.maintenanceConflict && (
                      <p className="inline-flex items-center gap-1 text-xs text-[#FCD34D]">
                        <AlertTriangle className="h-3.5 w-3.5" /> Scheduled maintenance overlaps this booking.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="primary" onClick={() => openQrPass(bk)}>
                      <QrCode className="h-3.5 w-3.5" /> QR Pass
                    </Button>
                    {bk.status === 'approved' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setConfirmCancel({
                            kind: 'booking',
                            id: bk.id,
                            label: eq?.name ?? bk.equipmentId,
                          })
                        }
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'waitlist' && (
        <div className="space-y-3">
          {myWaitlist.length === 0 ? (
            <EmptyState
              title="No waitlist entries"
              description="Waitlisted requests notify you automatically if a confirmed booking is cancelled."
            />
          ) : (
            myWaitlist.map((w) => {
              const eq = eqById.get(w.equipmentId);
              return (
                <Card key={w.id} padding="sm" className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#F8FAFC]">{eq?.name ?? w.equipmentId}</p>
                    <p className="font-mono text-xs text-[#94A3B8] tabular-nums">
                      Desired: {w.desiredStart.slice(0, 16).replace('T', ' ')}–{w.desiredEnd.slice(11, 16)} · Fairness
                      score {w.fairnessScore}/100
                    </p>
                  </div>
                  <StatusBadge status={w.status} />
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {pastRequests.length === 0 && myBookings.filter((b) => b.status === 'completed' || b.status === 'cancelled').length === 0 ? (
            <EmptyState title="No historical records" description="Completed or cancelled sessions appear here." />
          ) : (
            <>
              {myBookings
                .filter((b) => b.status === 'completed' || b.status === 'cancelled')
                .map((bk) => {
                  const eq = eqById.get(bk.equipmentId);
                  return (
                    <Card key={bk.id} padding="sm" className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#F8FAFC]">{eq?.name ?? bk.equipmentId}</p>
                        <p className="font-mono text-xs text-[#94A3B8] tabular-nums">
                          {bk.start.slice(0, 16).replace('T', ' ')}–{bk.end.slice(11, 16)}
                        </p>
                      </div>
                      <StatusBadge status={bk.status} />
                    </Card>
                  );
                })}
              {pastRequests.map((req) => {
                const eq = eqById.get(req.equipmentId);
                return (
                  <Card key={req.id} padding="sm" className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#F8FAFC]">{eq?.name ?? req.equipmentId}</p>
                      <p className="text-xs text-[#94A3B8]">
                        {req.requestedStart.slice(0, 16).replace('T', ' ')} {req.facultyNote ? `· ${req.facultyNote}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={req.status} />
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}

      <Modal
        open={Boolean(qrModal)}
        onClose={() => setQrModal(null)}
        title="Lab Access QR Pass"
        subtitle="Present this code to lab staff for session check-in and usage logging."
        maxWidth="sm"
      >
        {qrModal && (
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="rounded-xl bg-white p-3">
              <img src={qrModal.dataUrl} alt="Booking QR Code" className="h-48 w-48" />
            </div>
            <div className="space-y-1 text-xs">
              <p className="font-mono font-bold text-[#22D3EE]">
                {qrModal.booking.qrToken || `LABLINK-QR-${qrModal.booking.id}`}
              </p>
              <p className="text-[#F8FAFC]">
                {eqById.get(qrModal.booking.equipmentId)?.name ?? qrModal.booking.equipmentId}
              </p>
              <p className="font-mono text-[#94A3B8] tabular-nums">
                {qrModal.booking.start.slice(0, 16).replace('T', ' ')} – {qrModal.booking.end.slice(11, 16)}
              </p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmCancel)}
        title="Confirm Cancellation"
        message={`Cancel ${confirmCancel?.label ?? 'this item'}? Confirmed slot cancellations immediately release capacity and notify waitlisted students.`}
        confirmLabel="Cancel Session"
        loading={busy}
        onConfirm={handleConfirmCancel}
        onCancel={() => setConfirmCancel(null)}
      />
    </AppShell>
  );
};
