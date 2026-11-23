import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Input, Modal, Select, StatusBadge } from '../../components/ui/Primitives';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { departmentSchema } from '../../schemas/validation';
import type { Department } from '../../types/models';

export const AdminDepartmentsPage: React.FC = () => {
  const { data, pushToast } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [building, setBuilding] = useState('');
  const [headFacultyId, setHeadFacultyId] = useState('user-faculty-1');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setCode('');
    setName('');
    setBuilding('');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setCode(d.code);
    setName(d.name);
    setBuilding(d.building);
    setHeadFacultyId(d.headFacultyId ?? 'user-faculty-1');
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = departmentSchema.safeParse({ code, name, building, headFacultyId });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Check department fields.');
      return;
    }
    setSaving(true);
    try {
      await repo.upsertDepartment({ id: editing?.id, ...parsed.data, isDemo: editing?.isDemo ?? false });
      pushToast({ title: editing ? 'Department Updated' : 'Department Created', tone: 'success' });
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save department.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Campus Departments"
      subtitle="Academic departments participating in LabLink resource sharing."
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Add Department
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.departments.map((d) => {
          const eqCount = data.equipment.filter((e) => e.departmentId === d.id).length;
          const labCount = data.laboratories.filter((l) => l.departmentId === d.id).length;
          return (
            <Card key={d.id} className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-[#22D3EE]">{d.code}</span>
                  <h2 className="mt-1 text-base font-semibold text-[#F8FAFC]">{d.name}</h2>
                </div>
                <StatusBadge status={d.status} />
              </div>
              <div className="text-xs text-[#94A3B8] space-y-1">
                <p>Building: {d.building}</p>
                <p className="tabular-nums">
                  {labCount} lab(s) · {eqCount} equipment asset(s)
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>
                Edit Department
              </Button>
            </Card>
          );
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Department' : 'Add Department'}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Code" placeholder="BIOE" value={code} onChange={(e) => setCode(e.target.value)} required />
            <div className="sm:col-span-2">
              <Input label="Department Name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>
          <Input label="Primary Building" value={building} onChange={(e) => setBuilding(e.target.value)} required />
          <Select label="Department Head / Faculty" value={headFacultyId} onChange={(e) => setHeadFacultyId(e.target.value)}>
            {data.users
              .filter((u) => u.role === 'faculty' || u.role === 'admin')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>Save Department</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
};
