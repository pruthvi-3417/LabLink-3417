import React, { useMemo, useState } from 'react';
import { CheckCircle2, LogOut, QrCode } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, DataTable, Input, StatusBadge, type ColumnDef } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import type { Booking } from '../../types/models';

export const AdminBookingsPage: React.FC = () => {
  const { user } = useAuth();
  const { data, pushToast } = useData();
  const [qrInput, setQrInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);
  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users]);

  const handleQrVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !qrInput.trim()) return;
    setBusyId('qr');
    try {
      const bk = await repo.checkInByQr(qrInput.trim(), user.uid);
      pushToast({
        title: 'Checked In via QR',
        message: `${eqById.get(bk.equipmentId)?.equipmentId ?? bk.equipmentId} session started.`,
        tone: 'success',
      });
      setQrInput('');
    } catch (err) {
      pushToast({
        title: 'QR Check-In Rejected',
        message: err instanceof Error ? err.message : 'Invalid QR token.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCheckOut = async (bk: Booking) => {
    if (!user) return;
    setBusyId(bk.id);
    try {
      await repo.checkOutBooking(bk.id, user.uid);
      pushToast({
        title: 'Session Checked Out',
        message: 'Usage hours logged into student fairness history.',
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Check-Out Failed',
        message: err instanceof Error ? err.message : 'Unable to check out booking.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (bk: Booking) => {
    if (!user) return;
    setBusyId(bk.id);
    try {
      await repo.cancelBooking(bk.id, user.uid, user.role);
      pushToast({ title: 'Booking Cancelled & Slot Released', tone: 'info' });
    } catch (err) {
      pushToast({
        title: 'Cancellation Failed',
        message: err instanceof Error ? err.message : 'Unable to cancel booking.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const columns: ColumnDef<Booking>[] = [
    {
      key: 'student',
      header: 'Student',
      sortValue: (b) => userById.get(b.studentId)?.displayName ?? b.studentId,
      render: (b) => (
        <div>
          <p className="font-medium text-[#F8FAFC]">{userById.get(b.studentId)?.displayName ?? b.studentId}</p>
          <p className="font-mono text-[11px] text-[#64748B]">{b.qrToken || b.id}</p>
        </div>
      ),
    },
    {
      key: 'equipment',
      header: 'Equipment',
      sortValue: (b) => eqById.get(b.equipmentId)?.equipmentId ?? b.equipmentId,
      render: (b) => (
        <div>
          <span className="font-mono text-xs text-[#22D3EE]">{eqById.get(b.equipmentId)?.equipmentId}</span>
          <p className="text-xs text-[#CBD5E1]">{eqById.get(b.equipmentId)?.name}</p>
        </div>
      ),
    },
    {
      key: 'slot',
      header: 'Scheduled Slot',
      sortValue: (b) => b.start,
      render: (b) => (
        <span className="font-mono text-xs tabular-nums text-[#CBD5E1]">
          {b.start.slice(0, 16).replace('T', ' ')} – {b.end.slice(11, 16)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (b) => b.status,
      render: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: 'actions',
      header: 'Session Ops',
      render: (b) => (
        <div className="flex flex-wrap gap-1.5">
          {b.status === 'approved' && (
            <Button
              size="sm"
              variant="secondary"
              loading={busyId === b.id}
              onClick={() => {
                setQrInput(b.qrToken || b.id);
              }}
            >
              <QrCode className="h-3.5 w-3.5" /> Load QR
            </Button>
          )}
          {(b.status === 'approved' || b.status === 'checked_in') && (
            <Button size="sm" variant="success" loading={busyId === b.id} onClick={() => handleCheckOut(b)}>
              <LogOut className="h-3.5 w-3.5" /> Check Out
            </Button>
          )}
          {b.status === 'approved' && (
            <Button size="sm" variant="danger" loading={busyId === b.id} onClick={() => handleCancel(b)}>
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppShell
      title="Bookings & QR Check-In Desk"
      subtitle="Verify lab QR passes, check sessions out to log fairness hours, or release cancelled slots."
    >
      <Card className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]">
          <QrCode className="h-4 w-4 text-[#22D3EE]" />
          <span>QR Pass Check-In Verification</span>
        </div>
        <form onSubmit={handleQrVerify} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Scan or Paste Booking QR Token"
              placeholder="e.g., LABLINK-QR-bk-ws01-morning"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
            />
          </div>
          <Button type="submit" loading={busyId === 'qr'}>
            <CheckCircle2 className="h-4 w-4" /> Verify &amp; Check In
          </Button>
        </form>
      </Card>

      <DataTable
        rows={data.bookings}
        columns={columns}
        searchPlaceholder="Filter by student, equipment, or QR token..."
        searchText={(b) =>
          `${userById.get(b.studentId)?.displayName ?? ''} ${eqById.get(b.equipmentId)?.name ?? ''} ${b.qrToken ?? b.id}`
        }
      />
    </AppShell>
  );
};
