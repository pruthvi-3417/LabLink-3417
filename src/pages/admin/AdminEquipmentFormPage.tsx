import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { Button, Card, Input, Select, Textarea } from '../../components/ui/Primitives';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { repo } from '../../data/repo';
import { CATEGORY_IMAGE_MAP } from '../../data/seed';
import { equipmentSchema } from '../../schemas/validation';
import type { EquipmentCategory } from '../../types/models';

const CATEGORIES = Object.keys(CATEGORY_IMAGE_MAP) as EquipmentCategory[];

export const AdminEquipmentFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, pushToast } = useData();

  const existing = id ? data.equipment.find((e) => e.id === id) : undefined;

  const [equipmentId, setEquipmentId] = useState(existing?.equipmentId ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<EquipmentCategory>(existing?.category ?? 'GPU Workstation');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? data.departments[0]?.id ?? 'dept-aiml');
  const [laboratoryId, setLaboratoryId] = useState(existing?.laboratoryId ?? data.laboratories[0]?.id ?? 'lab-ai-innov');
  const [building, setBuilding] = useState(existing?.building ?? 'Turing Center');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 1));
  const [condition, setCondition] = useState(existing?.condition ?? 'excellent');
  const [maintenanceStatus, setMaintenanceStatus] = useState(existing?.maintenanceStatus ?? 'operational');
  const [responsibleFacultyId, setResponsibleFacultyId] = useState(
    existing?.responsibleFacultyId ??
      data.users.find((u) => u.role === 'faculty')?.id ??
      'user-faculty-1'
  );
  const [minBookingMins, setMinBookingMins] = useState(String(existing?.minBookingMins ?? 30));
  const [maxBookingMins, setMaxBookingMins] = useState(String(existing?.maxBookingMins ?? 240));
  const [usageRestrictions, setUsageRestrictions] = useState(existing?.usageRestrictions ?? '');
  const [requiresCertification, setRequiresCertification] = useState(existing?.requiresCertification ?? false);
  const [requiredCertification, setRequiredCertification] = useState(existing?.requiredCertification ?? '');
  const [allowsSplitBooking, setAllowsSplitBooking] = useState(existing?.allowsSplitBooking ?? true);
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [cuda, setCuda] = useState(Boolean(existing?.specs.cuda));
  const [vramGB, setVramGB] = useState(existing?.specs.vramGB ? String(existing.specs.vramGB) : '');
  const [cores, setCores] = useState(existing?.specs.cores ? String(existing.specs.cores) : '');
  const [architecture, setArchitecture] = useState(existing?.specs.architecture ? String(existing.specs.architecture) : '');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const facultyUsers = data.users.filter((u) => u.role === 'faculty' || u.role === 'admin');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const specs: Record<string, string | number | boolean | undefined> = {};
    if (cuda) specs.cuda = true;
    if (vramGB) specs.vramGB = Number(vramGB);
    if (cores) specs.cores = Number(cores);
    if (architecture.trim()) specs.architecture = architecture.trim();

    const parsed = equipmentSchema.safeParse({
      equipmentId: equipmentId.trim(),
      name: name.trim(),
      category,
      description: description.trim(),
      departmentId,
      laboratoryId,
      building: building.trim(),
      location: location.trim(),
      quantity: Number(quantity),
      condition,
      maintenanceStatus,
      responsibleFacultyId,
      minBookingMins: Number(minBookingMins),
      maxBookingMins: Number(maxBookingMins),
      usageRestrictions: usageRestrictions.trim() || undefined,
      requiresCertification,
      requiredCertification: requiresCertification ? requiredCertification.trim() || 'lab_safety_l1' : undefined,
      allowsSplitBooking,
      isActive,
      imageUrl: existing?.imageUrl || CATEGORY_IMAGE_MAP[category],
      specs,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Check equipment fields.');
      return;
    }

    setSubmitting(true);
    try {
      await repo.upsertEquipment(
        {
          id: existing?.id,
          ...parsed.data,
          isDemo: existing?.isDemo ?? false,
        },
        user.uid
      );
      pushToast({
        title: existing ? 'Equipment Updated' : 'Equipment Created',
        message: parsed.data.equipmentId,
        tone: 'success',
      });
      navigate('/admin/equipment');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save equipment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title={existing ? `Edit ${existing.equipmentId}` : 'Add Laboratory Equipment'}
      subtitle="Configure technical specs, booking rules, and faculty responsibility."
      actions={
        <Link to="/admin/equipment">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Inventory
          </Button>
        </Link>
      }
    >
      <Card className="mx-auto max-w-3xl" padding="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 p-3 text-xs text-[#FCA5A5]">{error}</p>}

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Equipment Code"
              placeholder="GPU-WS-09"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              required
            />
            <div className="sm:col-span-2">
              <Input
                label="Display Name"
                placeholder="NVIDIA H100 PCIe Research Node"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as EquipmentCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {data.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </Select>
            <Select label="Laboratory" value={laboratoryId} onChange={(e) => setLaboratoryId(e.target.value)}>
              {data.laboratories.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            label="Description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Building" value={building} onChange={(e) => setBuilding(e.target.value)} required />
            <Input label="Room / Bay Location" value={location} onChange={(e) => setLocation(e.target.value)} required />
            <Input label="Units Quantity" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Condition" value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)}>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="needs_service">Needs Service</option>
            </Select>
            <Select
              label="Maintenance Status"
              value={maintenanceStatus}
              onChange={(e) => setMaintenanceStatus(e.target.value as typeof maintenanceStatus)}
            >
              <option value="operational">Operational</option>
              <option value="scheduled">Maintenance Scheduled</option>
              <option value="under_maintenance">Under Maintenance</option>
            </Select>
            <Select
              label="Responsible Faculty"
              value={responsibleFacultyId}
              onChange={(e) => setResponsibleFacultyId(e.target.value)}
            >
              {facultyUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Input label="Min Mins" type="number" min={15} value={minBookingMins} onChange={(e) => setMinBookingMins(e.target.value)} />
            <Input label="Max Mins" type="number" min={30} value={maxBookingMins} onChange={(e) => setMaxBookingMins(e.target.value)} />
            <Input label="VRAM GB (opt)" type="number" min={0} value={vramGB} onChange={(e) => setVramGB(e.target.value)} />
            <Input label="Cores (opt)" type="number" min={0} value={cores} onChange={(e) => setCores(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Architecture / Model Spec" value={architecture} onChange={(e) => setArchitecture(e.target.value)} />
            <Input label="Usage Restrictions (optional)" value={usageRestrictions} onChange={(e) => setUsageRestrictions(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-6 text-xs text-[#CBD5E1]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cuda} onChange={(e) => setCuda(e.target.checked)} />
              CUDA Capable
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowsSplitBooking} onChange={(e) => setAllowsSplitBooking(e.target.checked)} />
              Allows Split Booking
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active in Catalog
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={requiresCertification} onChange={(e) => setRequiresCertification(e.target.checked)} />
              Requires Safety Certification
            </label>
          </div>

          {requiresCertification && (
            <Input
              label="Required Certification Code"
              placeholder="e.g., robotics_arm"
              value={requiredCertification}
              onChange={(e) => setRequiredCertification(e.target.value)}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Link to="/admin/equipment">
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button type="submit" loading={submitting}>
              {existing ? 'Save Changes' : 'Create Equipment'}
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
};
