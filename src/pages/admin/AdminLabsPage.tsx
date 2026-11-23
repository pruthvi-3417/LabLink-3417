import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Input, Modal, Select, StatusBadge } from '../../components/ui/Primitives';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { laboratorySchema } from '../../schemas/validation';
import type { Laboratory } from '../../types/models';

export const AdminLabsPage: React.FC = () => {
  const { data, pushToast } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Laboratory | null>(null);

  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState(data.departments[0]?.id ?? 'dept-cse');
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');
  const [openHour, setOpenHour] = useState('09:00');
  const [closeHour, setCloseHour] = useState('18:00');
  const [facultyInChargeId, setFacultyInChargeId] = useState('user-faculty-1');
  const [capacity, setCapacity] = useState('20');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const deptById = useMemo(() => new Map(data.departments.map((d) => [d.id, d])), [data.departments]);
  const userById = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setBuilding('');
    setRoom('');
    setOpenHour('09:00');
    setCloseHour('18:00');
    setCapacity('20');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (lab: Laboratory) => {
    setEditing(lab);
    setName(lab.name);
    setDepartmentId(lab.departmentId);
    setBuilding(lab.building);
    setRoom(lab.room);
    setOpenHour(lab.openHour);
    setCloseHour(lab.closeHour);
    setFacultyInChargeId(lab.facultyInChargeId);
    setCapacity(String(lab.capacity ?? 20));
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = laboratorySchema.safeParse({
      name,
      departmentId,
      building,
      room,
      openHour,
      closeHour,
      facultyInChargeId,
      capacity: Number(capacity),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Invalid lab inputs.');
      return;
    }
    setSaving(true);
    try {
      await repo.upsertLaboratory({ id: editing?.id, ...parsed.data, isDemo: editing?.isDemo ?? false });
      pushToast({ title: editing ? 'Laboratory Updated' : 'Laboratory Created', tone: 'success' });
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save laboratory.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Campus Laboratories"
      subtitle="Configure lab operating hours, capacities, and faculty supervision."
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Add Laboratory
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.laboratories.map((lab) => {
          const eqCount = data.equipment.filter((e) => e.laboratoryId === lab.id).length;
          return (
            <Card key={lab.id} className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-medium text-[#22D3EE]">
                    {deptById.get(lab.departmentId)?.code ?? lab.departmentId}
                  </span>
                  <h2 className="mt-1 text-base font-semibold text-[#F8FAFC]">{lab.name}</h2>
                </div>
                <StatusBadge status={lab.status} />
              </div>
              <div className="space-y-1 text-xs text-[#94A3B8]">
                <p>
                  Location: <span className="text-[#CBD5E1]">{lab.building} · {lab.room}</span>
                </p>
                <p>
                  Operating Hours:{' '}
                  <span className="font-mono text-[#F8FAFC] tabular-nums">
                    {lab.openHour}–{lab.closeHour}
                  </span>
                </p>
                <p>
                  Supervisor:{' '}
                  <span className="text-[#CBD5E1]">{userById.get(lab.facultyInChargeId)?.displayName ?? lab.facultyInChargeId}</span>
                </p>
                <p className="tabular-nums">
                  {eqCount} equipment asset(s) · Seat capacity {lab.capacity ?? 20}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => openEdit(lab)}>
                Edit Lab
              </Button>
            </Card>
          );
        })}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Laboratory' : 'Add Laboratory'}>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}
          <Input label="Laboratory Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </Select>
            <Select label="Faculty In Charge" value={facultyInChargeId} onChange={(e) => setFacultyInChargeId(e.target.value)}>
              {data.users
                .filter((u) => u.role === 'faculty' || u.role === 'admin')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Building" value={building} onChange={(e) => setBuilding(e.target.value)} required />
            <Input label="Room" value={room} onChange={(e) => setRoom(e.target.value)} required />
            <Input label="Capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Open Hour (HH:MM)" value={openHour} onChange={(e) => setOpenHour(e.target.value)} required />
            <Input label="Close Hour (HH:MM)" value={closeHour} onChange={(e) => setCloseHour(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>Save Laboratory</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
};
