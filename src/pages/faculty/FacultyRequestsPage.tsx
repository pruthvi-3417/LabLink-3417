import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, DataTable, StatusBadge, Tabs, type ColumnDef } from '../../components/ui/Primitives';
import { useData } from '../../context/DataContext';
import type { BookingRequest } from '../../types/models';

export const FacultyRequestsPage: React.FC = () => {
  const { data, loading } = useData();
  const [filterTab, setFilterTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);
  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users]);
  const projById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);

  const rows = useMemo(() => {
    return data.bookingRequests.filter((r) => {
      if (filterTab === 'pending') return ['submitted', 'pending_approval', 'ai_recommended'].includes(r.status);
      if (filterTab === 'approved') return r.status === 'approved' || r.status === 'completed';
      if (filterTab === 'rejected') return r.status === 'rejected' || r.status === 'cancelled';
      return true;
    });
  }, [data.bookingRequests, filterTab]);

  const columns: ColumnDef<BookingRequest>[] = [
    {
      key: 'student',
      header: 'Student & Project',
      sortValue: (r) => userById.get(r.studentId)?.displayName ?? r.studentId,
      render: (r) => (
        <div>
          <p className="font-medium text-[#F8FAFC]">{userById.get(r.studentId)?.displayName ?? r.studentId}</p>
          <p className="text-xs text-[#94A3B8]">{projById.get(r.projectId)?.title ?? r.projectId}</p>
        </div>
      ),
    },
    {
      key: 'equipment',
      header: 'Equipment',
      sortValue: (r) => eqById.get(r.equipmentId)?.equipmentId ?? r.equipmentId,
      render: (r) => {
        const eq = eqById.get(r.equipmentId);
        return (
          <div>
            <p className="font-mono text-xs text-[#22D3EE]">{eq?.equipmentId ?? r.equipmentId}</p>
            <p className="text-xs text-[#CBD5E1]">{eq?.name}</p>
          </div>
        );
      },
    },
    {
      key: 'window',
      header: 'Requested Slot',
      sortValue: (r) => r.requestedStart,
      render: (r) => (
        <span className="font-mono text-xs tabular-nums text-[#CBD5E1]">
          {r.requestedStart.slice(0, 16).replace('T', ' ')} – {r.requestedEnd.slice(11, 16)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'action',
      header: 'Review',
      render: (r) => (
        <Link to={`/faculty/requests/${r.id}`}>
          <Button size="sm" variant="secondary">
            Inspect <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <AppShell
      title="Booking Requests Queue"
      subtitle="Review individual requests or arbitrate overlapping requests in Conflict Resolution Studio."
      actions={
        <Link to="/faculty/allocation">
          <Button variant="primary">Open Conflict Studio</Button>
        </Link>
      }
    >
      <Tabs
        activeId={filterTab}
        onChange={(id) => setFilterTab(id as typeof filterTab)}
        items={[
          {
            id: 'pending',
            label: 'Pending',
            count: data.bookingRequests.filter((r) => ['submitted', 'pending_approval', 'ai_recommended'].includes(r.status))
              .length,
          },
          {
            id: 'approved',
            label: 'Approved',
            count: data.bookingRequests.filter((r) => r.status === 'approved' || r.status === 'completed').length,
          },
          {
            id: 'rejected',
            label: 'Rejected / Cancelled',
            count: data.bookingRequests.filter((r) => r.status === 'rejected' || r.status === 'cancelled').length,
          },
          { id: 'all', label: 'All', count: data.bookingRequests.length },
        ]}
      />

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search student, project, equipment..."
        searchText={(r) =>
          `${userById.get(r.studentId)?.displayName ?? ''} ${projById.get(r.projectId)?.title ?? ''} ${
            eqById.get(r.equipmentId)?.name ?? ''
          } ${eqById.get(r.equipmentId)?.equipmentId ?? ''}`
        }
      />
    </AppShell>
  );
};
