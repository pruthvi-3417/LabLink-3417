import React, { useMemo } from 'react';
import { AppShell } from '../../components/AppShell';
import { EquipmentCard } from '../../components/EquipmentCard';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export const FacultyEquipmentPage: React.FC = () => {
  const { user } = useAuth();
  const { data } = useData();

  const deptById = useMemo(() => new Map(data.departments.map((d) => [d.id, d])), [data.departments]);
  const labById = useMemo(() => new Map(data.laboratories.map((l) => [l.id, l])), [data.laboratories]);

  const supervised = useMemo(() => {
    if (!user || user.role === 'admin') return data.equipment;
    const own = data.equipment.filter((e) => e.responsibleFacultyId === user.uid);
    return own.length > 0 ? own : data.equipment;
  }, [data.equipment, user]);

  return (
    <AppShell
      title="Supervised Laboratory Equipment"
      subtitle="Hardware assets under your faculty supervision and conflict arbitration."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {supervised.map((eq) => (
          <EquipmentCard
            key={eq.id}
            equipment={eq}
            detailHref={`/faculty/allocation?eq=${eq.id}`}
            departmentCode={deptById.get(eq.departmentId)?.code}
            laboratoryName={labById.get(eq.laboratoryId)?.name}
            actionLabel="Open in Conflict Studio"
          />
        ))}
      </div>
    </AppShell>
  );
};
