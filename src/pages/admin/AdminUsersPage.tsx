import React, { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, DataTable, Select, StatusBadge, type ColumnDef } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import type { UserProfile, UserRole } from '../../types/models';

export const AdminUsersPage: React.FC = () => {
  const { user } = useAuth();
  const { data, pushToast } = useData();

  const deptById = useMemo(() => new Map(data.departments.map((d) => [d.id, d])), [data.departments]);

  const handleReviewRole = async (reqId: string, decision: 'approved' | 'rejected') => {
    if (!user) return;
    try {
      await repo.reviewRoleRequest(reqId, decision, user.uid);
      pushToast({
        title: `Role Request ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
        tone: decision === 'approved' ? 'success' : 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Role Review Failed',
        message: err instanceof Error ? err.message : 'Unable to process role request.',
        tone: 'error',
      });
    }
  };

  const handleRoleChange = async (targetUid: string, nextRole: UserRole) => {
    if (!user) return;
    try {
      await repo.adminUpdateUserRole(targetUid, nextRole, user.uid);
      pushToast({ title: 'User Role Updated', message: `Assigned role: ${nextRole}`, tone: 'success' });
    } catch (err) {
      pushToast({
        title: 'Role Update Failed',
        message: err instanceof Error ? err.message : 'Unable to update user role.',
        tone: 'error',
      });
    }
  };

  const pendingRoleRequests = data.roleRequests.filter((r) => r.status === 'pending');

  const columns: ColumnDef<UserProfile>[] = [
    {
      key: 'name',
      header: 'User',
      sortValue: (u) => u.displayName,
      render: (u) => (
        <div>
          <p className="font-medium text-[#F8FAFC]">{u.displayName}</p>
          <p className="font-mono text-xs text-[#94A3B8]">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'dept',
      header: 'Department',
      sortValue: (u) => deptById.get(u.departmentId)?.code ?? u.departmentId,
      render: (u) => <span className="text-xs text-[#CBD5E1]">{deptById.get(u.departmentId)?.name ?? u.departmentId}</span>,
    },
    {
      key: 'certs',
      header: 'Certifications',
      render: (u) => (
        <span className="font-mono text-[11px] text-[#94A3B8]">
          {(u.certifications ?? []).join(', ') || 'None'}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Assigned Role',
      sortValue: (u) => u.role,
      render: (u) => (
        <div className="w-36">
          <Select value={u.role} onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}>
            <option value="student">student</option>
            <option value="faculty">faculty</option>
            <option value="admin">admin</option>
          </Select>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Account',
      render: (u) => <StatusBadge status={u.status} />,
    },
  ];

  return (
    <AppShell
      title="Users & Role Governance"
      subtitle="Review elevated role requests and manage campus department memberships."
    >
      {pendingRoleRequests.length > 0 && (
        <Card className="space-y-3 border-[#22D3EE]/30">
          <h2 className="font-display text-base font-semibold text-[#F8FAFC]">
            Pending Elevated Role Requests ({pendingRoleRequests.length})
          </h2>
          <div className="space-y-2.5">
            {pendingRoleRequests.map((rr) => (
              <div
                key={rr.id}
                className="flex flex-col gap-3 rounded-lg border border-white/10 bg-[#0D1424] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#F8FAFC]">{rr.displayName}</span>
                    <span className="font-mono text-[#94A3B8]">({rr.email})</span>
                    <span className="rounded bg-[#3B82F6]/20 px-1.5 py-0.5 font-mono text-[11px] text-[#93C5FD]">
                      requests {rr.requestedRole.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[#CBD5E1]">{rr.justification}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="success" onClick={() => handleReviewRole(rr.id, 'approved')}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleReviewRole(rr.id, 'rejected')}>
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <DataTable
        rows={data.users}
        columns={columns}
        searchPlaceholder="Filter users by name, email, role..."
        searchText={(u) => `${u.displayName} ${u.email} ${u.role}`}
      />
    </AppShell>
  );
};
