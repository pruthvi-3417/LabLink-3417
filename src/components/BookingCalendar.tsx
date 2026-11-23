import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  DEMO_NOW,
  DEMO_SCENARIO_DAY,
  formatLocalIso,
  makeDayTimeMs,
  parseHourMinute,
  parseIsoMs,
  toDateKey,
} from '../engine/constants';
import type { Booking, BookingRequest, Equipment, Laboratory, MaintenanceRecord } from '../types/models';
import { Button } from './ui/Primitives';

interface SlotSelection {
  start: string;
  end: string;
}

export const BookingCalendar: React.FC<{
  equipment: Equipment;
  laboratory?: Laboratory;
  bookings: Booking[];
  pendingRequests?: BookingRequest[];
  maintenance: MaintenanceRecord[];
  recommendedSlot?: { start: string; end: string } | null;
  initialDate?: string;
  onSelectSlot?: (slot: SlotSelection) => void;
}> = ({
  equipment,
  laboratory,
  bookings,
  pendingRequests = [],
  maintenance,
  recommendedSlot,
  initialDate = DEMO_SCENARIO_DAY,
  onSelectSlot,
}) => {
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [granularity, setGranularity] = useState<'60' | '30'>('60');
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [dragStartMin, setDragStartMin] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ startM: number; endM: number } | null>(null);

  const openHour = parseHourMinute(laboratory?.openHour ?? '09:00').hour;
  const closeHour = parseHourMinute(laboratory?.closeHour ?? '18:00').hour;

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = openHour; h < closeHour; h++) arr.push(h);
    return arr;
  }, [openHour, closeHour]);

  const dayStepMins = granularity === '30' ? 30 : 60;

  const daySlots = useMemo(() => {
    const arr: number[] = [];
    for (let m = openHour * 60; m < closeHour * 60; m += dayStepMins) arr.push(m);
    return arr;
  }, [openHour, closeHour, dayStepMins]);

  const weekDates = useMemo(() => {
    const base = new Date(`${selectedDate}T00:00:00`);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      return toDateKey(d.getTime());
    });
  }, [selectedDate]);

  const fmtMin = (totalMins: number) => {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const shiftDate = (days: number) => {
    const d = new Date(`${selectedDate}T00:00:00`);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    setSelectedDate(toDateKey(next.getTime()));
    setSelectedRange(null);
    setDragStartMin(null);
  };

  const inspectWindowState = (dayKey: string, startMin: number, durationMins: number) => {
    const slotStartMs = makeDayTimeMs(dayKey, fmtMin(startMin));
    const slotEndMs = makeDayTimeMs(dayKey, fmtMin(startMin + durationMins));

    const maintHit = maintenance.find(
      (m) =>
        m.equipmentId === equipment.id &&
        m.status !== 'cancelled' &&
        m.status !== 'completed' &&
        parseIsoMs(m.start) < slotEndMs &&
        parseIsoMs(m.end) > slotStartMs
    );
    if (maintHit) return { kind: 'maintenance' as const, label: maintHit.title };

    const confirmedUnits = bookings
      .filter(
        (b) =>
          b.equipmentId === equipment.id &&
          (b.status === 'approved' || b.status === 'checked_in') &&
          parseIsoMs(b.start) < slotEndMs &&
          parseIsoMs(b.end) > slotStartMs
      )
      .reduce((s, b) => s + b.units, 0);

    if (confirmedUnits >= equipment.quantity) {
      return { kind: 'confirmed' as const, label: 'Confirmed booking' };
    }

    if (
      recommendedSlot &&
      parseIsoMs(recommendedSlot.start) < slotEndMs &&
      parseIsoMs(recommendedSlot.end) > slotStartMs
    ) {
      return { kind: 'recommended' as const, label: 'AI recommended' };
    }

    const pendingHit = pendingRequests.find(
      (r) =>
        r.equipmentId === equipment.id &&
        ['submitted', 'pending_approval', 'ai_recommended'].includes(r.status) &&
        parseIsoMs(r.requestedStart) < slotEndMs &&
        parseIsoMs(r.requestedEnd) > slotStartMs
    );
    if (pendingHit) return { kind: 'pending' as const, label: 'Pending request' };

    return { kind: 'free' as const, label: 'Available' };
  };

  const handleSlotClick = (dayKey: string, startMin: number, durationMins: number, kind: string) => {
    if (!onSelectSlot || kind === 'maintenance' || kind === 'confirmed') return;
    if (dayKey !== selectedDate) {
      setSelectedDate(dayKey);
      setDragStartMin(startMin);
      setSelectedRange({ startM: startMin, endM: startMin + durationMins });
      onSelectSlot({
        start: `${dayKey}T${fmtMin(startMin)}:00`,
        end: `${dayKey}T${fmtMin(startMin + durationMins)}:00`,
      });
      return;
    }

    if (dragStartMin === null) {
      setDragStartMin(startMin);
      setSelectedRange({ startM: startMin, endM: startMin + durationMins });
      onSelectSlot({
        start: `${dayKey}T${fmtMin(startMin)}:00`,
        end: `${dayKey}T${fmtMin(startMin + durationMins)}:00`,
      });
    } else {
      const startM = Math.min(dragStartMin, startMin);
      const endM = Math.max(dragStartMin, startMin) + durationMins;
      setDragStartMin(null);
      setSelectedRange({ startM, endM });
      onSelectSlot({
        start: `${dayKey}T${fmtMin(startM)}:00`,
        end: `${dayKey}T${fmtMin(endM)}:00`,
      });
    }
  };

  const styleForKind = (kind: string, isSelected: boolean) => {
    if (isSelected) return 'border-[#22D3EE] bg-[#22D3EE]/20 text-[#F8FAFC]';
    if (kind === 'maintenance') return 'border-[#F59E0B]/40 bg-[#F59E0B]/15 text-[#FCD34D] cursor-not-allowed';
    if (kind === 'confirmed') return 'border-[#EF4444]/35 bg-[#EF4444]/15 text-[#FCA5A5] cursor-not-allowed';
    if (kind === 'recommended') return 'border-[#22D3EE]/40 bg-[#22D3EE]/12 text-[#67E8F9] hover:bg-[#22D3EE]/20';
    if (kind === 'pending') return 'border-[#8B5CF6]/40 bg-[#8B5CF6]/15 text-[#C4B5FD] hover:bg-[#8B5CF6]/25';
    return 'border-white/10 bg-[#0B1220] text-[#94A3B8] hover:border-[#3B82F6]/50 hover:bg-[#17243A]';
  };

  // Current-time / DEMO_NOW marker when viewing the active day
  const nowIso = selectedDate === DEMO_SCENARIO_DAY ? DEMO_NOW : formatLocalIso(Date.now());
  const nowDate = nowIso.slice(0, 10);
  const nowHour = Number(nowIso.slice(11, 13));
  const nowMin = Number(nowIso.slice(14, 16));
  const nowTotalMins = nowHour * 60 + nowMin;
  const showNowMarker =
    selectedDate === nowDate && nowTotalMins >= openHour * 60 && nowTotalMins <= closeHour * 60;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => shiftDate(-1)} aria-label="Previous day">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setSelectedRange(null);
              setDragStartMin(null);
            }}
            className="rounded-lg border border-white/10 bg-[#0B1220] px-2.5 py-1 text-xs font-mono text-[#F8FAFC]"
          />
          <Button size="sm" variant="secondary" onClick={() => shiftDate(1)} aria-label="Next day">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'day' && (
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B1220] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setGranularity('60')}
                className={`rounded-md px-2 py-1 font-mono cursor-pointer ${
                  granularity === '60' ? 'bg-[#17243A] text-[#22D3EE]' : 'text-[#94A3B8]'
                }`}
              >
                60m
              </button>
              <button
                type="button"
                onClick={() => setGranularity('30')}
                className={`rounded-md px-2 py-1 font-mono cursor-pointer ${
                  granularity === '30' ? 'bg-[#17243A] text-[#22D3EE]' : 'text-[#94A3B8]'
                }`}
              >
                30m
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B1220] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`rounded-md px-2.5 py-1 whitespace-nowrap cursor-pointer ${
                viewMode === 'day' ? 'bg-[#17243A] text-[#F8FAFC]' : 'text-[#94A3B8]'
              }`}
            >
              Day View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`rounded-md px-2.5 py-1 whitespace-nowrap cursor-pointer ${
                viewMode === 'week' ? 'bg-[#17243A] text-[#F8FAFC]' : 'text-[#94A3B8]'
              }`}
            >
              5-Day Week
            </button>
          </div>
        </div>
      </div>

      {/* Semantic Legend with Icons + Text */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#0B1220] px-3 py-2 text-[11px] text-[#94A3B8]">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="inline-flex items-center gap-1 text-[#6EE7B7]">
            <CheckCircle2 className="h-3 w-3" /> Available
          </span>
          <span className="inline-flex items-center gap-1 text-[#FCA5A5]">
            <XCircle className="h-3 w-3" /> Confirmed
          </span>
          <span className="inline-flex items-center gap-1 text-[#C4B5FD]">
            <Clock className="h-3 w-3" /> Pending
          </span>
          <span className="inline-flex items-center gap-1 text-[#FCD34D]">
            <Wrench className="h-3 w-3" /> Maintenance
          </span>
          {recommendedSlot && (
            <span className="inline-flex items-center gap-1 text-[#67E8F9]">
              <Sparkles className="h-3 w-3" /> AI recommended
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-[#64748B]">
          Lab window {String(openHour).padStart(2, '0')}:00–{String(closeHour).padStart(2, '0')}:00
          {showNowMarker ? ` · Now ${fmtMin(nowTotalMins)}` : ''}
        </span>
      </div>

      {viewMode === 'day' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {daySlots.map((slotMin) => {
            const state = inspectWindowState(selectedDate, slotMin, dayStepMins);
            const isSelected = Boolean(
              selectedRange && slotMin >= selectedRange.startM && slotMin < selectedRange.endM
            );
            const isNowSlot =
              showNowMarker && nowTotalMins >= slotMin && nowTotalMins < slotMin + dayStepMins;

            return (
              <button
                key={slotMin}
                type="button"
                disabled={!onSelectSlot || state.kind === 'confirmed' || state.kind === 'maintenance'}
                onClick={() => handleSlotClick(selectedDate, slotMin, dayStepMins, state.kind)}
                className={`relative rounded-lg border p-2.5 text-left transition-colors ${styleForKind(
                  state.kind,
                  isSelected
                )}`}
              >
                {isNowSlot && (
                  <span
                    className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-[#22D3EE]"
                    title="Current timeline reference"
                  />
                )}
                <div className="flex items-center justify-between gap-1 font-mono text-xs font-semibold tabular-nums">
                  <span>{fmtMin(slotMin)}</span>
                  {isSelected ? (
                    <span className="text-[10px] text-[#22D3EE]">SEL</span>
                  ) : isNowSlot ? (
                    <span className="text-[9px] text-[#22D3EE]">NOW</span>
                  ) : null}
                </div>
                <div className="mt-1 truncate text-[11px]">{state.label}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[620px] space-y-1.5">
            {weekDates.map((dKey) => (
              <div key={dKey} className="grid grid-cols-[105px_repeat(9,minmax(0,1fr))] gap-1.5 items-center">
                <span className="sticky left-0 z-10 bg-[#111B2E] pr-2 py-1 font-mono text-xs text-[#94A3B8] tabular-nums">
                  {dKey}
                </span>
                {hours.slice(0, 9).map((h) => {
                  const slotMin = h * 60;
                  const state = inspectWindowState(dKey, slotMin, 60);
                  const isSelected =
                    dKey === selectedDate &&
                    Boolean(selectedRange && slotMin >= selectedRange.startM && slotMin < selectedRange.endM);
                  return (
                    <button
                      key={`${dKey}-${h}`}
                      type="button"
                      title={`${dKey} ${String(h).padStart(2, '0')}:00 — ${state.label}`}
                      disabled={!onSelectSlot || state.kind === 'confirmed' || state.kind === 'maintenance'}
                      onClick={() => handleSlotClick(dKey, slotMin, 60, state.kind)}
                      className={`rounded-md border px-1.5 py-2 text-center font-mono text-[11px] tabular-nums transition-colors ${styleForKind(
                        state.kind,
                        isSelected
                      )}`}
                    >
                      {String(h).padStart(2, '0')}h
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {onSelectSlot && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
          <span>
            Click one block for start time, then click an end block to select a multi-slot window.
          </span>
          {selectedRange && (
            <button
              type="button"
              onClick={() => {
                setSelectedRange(null);
                setDragStartMin(null);
              }}
              className="font-mono text-[#22D3EE] hover:underline cursor-pointer"
            >
              Selected {fmtMin(selectedRange.startM)}–{fmtMin(selectedRange.endM)} · Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};
