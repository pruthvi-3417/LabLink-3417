import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Edit, Plus, Power } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, DataTable, StatusBadge, type ColumnDef } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import type { Equipment } from '../../types/models';

export const AdminEquipmentPage: React.FC = () => {
  const { user } = useAuth();
  const { data, loading, pushToast } = useData();

  const deptById = useMemo(() => new Map(data.departments.map((d) => [d.id, d])), [data.departments]);
  const labById = useMemo(() => new Map(data.laboratories.map((l) => [l.id, l])), [data.laboratories]);

  const handleToggle = async (eq: Equipment) => {
    if (!user) return;
    try {
      await repo.toggleEquipmentActive(eq.id, !eq.isActive, user.uid);
      pushToast({
        title: eq.isActive ? 'Equipment Deactivated' : 'Equipment Activated',
        message: eq.equipmentId,
        tone: 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Update Failed',
        message: err instanceof Error ? err.message : 'Unable to update equipment status.',
        tone: 'error',
      });
    }
  };

  const columns: ColumnDef<Equipment>[] = [
    {
      key: 'code',
      header: 'Asset ID & Name',
      sortValue: (e) => e.equipmentId,
      render: (e) => (
        <div>
          <span className="font-mono text-xs text-[#22D3EE]">{e.equipmentId}</span>
          <p className="font-medium text-[#F8FAFC]">{e.name}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortValue: (e) => e.category,
      render: (e) => <span className="text-xs text-[#CBD5E1]">{e.category}</span>,
    },
    {
      key: 'location',
      header: 'Dept · Lab',
      sortValue: (e) => deptById.get(e.departmentId)?.code ?? e.departmentId,
      render: (e) => (
        <div className="text-xs">
          <span className="font-medium text-[#F8FAFC]">{deptById.get(e.departmentId)?.code ?? e.departmentId}</span>
          <p className="text-[#94A3B8]">{labById.get(e.laboratoryId)?.name ?? e.building}</p>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Units',
      sortValue: (e) => e.quantity,
      render: (e) => <span className="font-mono text-xs tabular-nums">{e.quantity}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (e) => (e.isActive ? e.maintenanceStatus : 'inactive'),
      render: (e) => <StatusBadge status={e.isActive ? e.maintenanceStatus : 'inactive'} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (e) => (
        <div className="flex items-center gap-2">
          <Link to={`/admin/equipment/${e.id}/edit`}>
            <Button size="sm" variant="secondary">
              <Edit className="h-3.5 w-3.5" /> Edit
            </Button>
          </Link>
          <Button size="sm" variant={e.isActive ? 'ghost' : 'success'} onClick={() => handleToggle(e)}>
            <Power className="h-3.5 w-3.5" /> {e.isActive ? 'Disable' : 'Enable'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppShell
      title="Equipment Inventory Management"
      subtitle="Add, edit, or deactivate campus laboratory hardware across all departments."
      actions={
        <Link to="/admin/equipment/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" /> New Equipment
          </Button>
        </Link>
      }
    >
      <DataTable
        rows={data.equipment}
        columns={columns}
        loading={loading}
        searchPlaceholder="Search asset ID, name, category, building..."
        searchText={(e) => `${e.equipmentId} ${e.name} ${e.category} ${e.building}`}
      />
    </AppShell>
  );
};
