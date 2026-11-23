import React, { useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { BookingCalendar } from '../../components/BookingCalendar';
import { Card, Select } from '../../components/ui/Primitives';
import { useData } from '../../context/DataContext';

export const FacultyCalendarPage: React.FC = () => {
  const { data } = useData();
  const [selectedEqId, setSelectedEqId] = useState(data.equipment[0]?.id ?? '');

  const eq = data.equipment.find((e) => e.id === selectedEqId) ?? data.equipment[0];
  const lab = eq ? data.laboratories.find((l) => l.id === eq.laboratoryId) : undefined;

  return (
    <AppShell title="Laboratory Schedule Calendar" subtitle="Inspect confirmed bookings, pending contention, and maintenance blackouts per asset.">
      <Card className="space-y-4">
        <div className="max-w-md">
          <Select label="Select Laboratory Equipment" value={eq?.id ?? ''} onChange={(e) => setSelectedEqId(e.target.value)}>
            {data.equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.equipmentId} — {item.name}
              </option>
            ))}
          </Select>
        </div>

        {eq && (
          <BookingCalendar
            equipment={eq}
            laboratory={lab}
            bookings={data.bookings}
            pendingRequests={data.bookingRequests}
            maintenance={data.maintenance}
          />
        )}
      </Card>
    </AppShell>
  );
};
