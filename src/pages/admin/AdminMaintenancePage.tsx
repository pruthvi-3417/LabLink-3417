import React, { useMemo, useState } from 'react';
import { CheckCircle2, Wrench } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Input, Select, StatusBadge, Textarea } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { DEMO_SCENARIO_DAY } from '../../engine/constants';
import { maintenanceSchema } from '../../schemas/validation';

export const AdminMaintenancePage: React.FC = () => {
  const { user } = useAuth();
  const { data, pushToast } = useData();

  const [equipmentId, setEquipmentId] = useState(data.equipment[0]?.id ?? 'gpu-ws-01');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(`${DEMO_SCENARIO_DAY}T15:00`);
  const [end, setEnd] = useState(`${DEMO_SCENARIO_DAY}T17:00`);
  const [technician, setTechnician] = useState('Campus Lab Engineering');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const parsed = maintenanceSchema.safeParse({
      equipmentId,
      title,
      description: description || undefined,
      start: `${start}:00`,
      end: `${end}:00`,
      technician: technician || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Check maintenance fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await repo.scheduleMaintenance({ ...parsed.data, isDemo: false }, user.uid);
      pushToast({
        title: 'Maintenance Window Scheduled',
        message:
          res.flaggedBookingsCount > 0
            ? `Flagged ${res.flaggedBookingsCount} overlapping confirmed booking(s) and alerted students.`
            : 'Allocation engine will block requests overlapping this window.',
        tone: res.flaggedBookingsCount > 0 ? 'warning' : 'success',
      });
      setTitle('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to schedule maintenance.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (id: string) => {
    if (!user) return;
    try {
      await repo.completeMaintenance(id, user.uid);
      pushToast({ title: 'Maintenance Completed', message: 'Equipment restored to operational queue.', tone: 'success' });
    } catch (err) {
      pushToast({
        title: 'Update Failed',
        message: err instanceof Error ? err.message : 'Unable to complete maintenance record.',
        tone: 'error',
      });
    }
  };

  return (
    <AppShell
      title="Equipment Maintenance & Calibration"
      subtitle="Scheduled maintenance automatically blocks conflicting requests and alerts impacted bookings."
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 text-base font-semibold text-[#F8FAFC]">
            <Wrench className="h-4 w-4 text-[#F59E0B]" />
            <span>Schedule Maintenance Window</span>
          </div>
          <form onSubmit={handleSchedule} className="space-y-3.5">
            {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}
            <Select label="Equipment" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
              {data.equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.equipmentId} — {eq.name}
                </option>
              ))}
            </Select>
            <Input
              label="Maintenance Title"
              placeholder="e.g., Firmware & Thermal Calibration"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
              <Input label="End" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
            <Input label="Assigned Technician" value={technician} onChange={(e) => setTechnician(e.target.value)} />
            <Textarea label="Service Notes" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            <Button type="submit" className="w-full" loading={submitting}>
              Schedule &amp; Check Conflicts
            </Button>
          </form>
        </Card>

        <div className="lg:col-span-7 space-y-3">
          <h2 className="font-display text-lg font-semibold">Active &amp; Historical Maintenance Log</h2>
          {data.maintenance.map((m) => {
            const eq = eqById.get(m.equipmentId);
            return (
              <Card key={m.id} padding="sm" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-[#22D3EE]">{eq?.equipmentId ?? m.equipmentId}</span>
                    <span className="text-sm font-semibold text-[#F8FAFC]">{m.title}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <p className="font-mono text-xs text-[#94A3B8] tabular-nums">
                    {m.start.slice(0, 16).replace('T', ' ')} → {m.end.slice(0, 16).replace('T', ' ')} ·{' '}
                    {m.technician ?? 'Lab Ops'}
                  </p>
                  {m.description && <p className="text-xs text-[#94A3B8]">{m.description}</p>}
                </div>
                {m.status !== 'completed' && m.status !== 'cancelled' && (
                  <Button size="sm" variant="success" onClick={() => handleComplete(m.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Completed
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
};
