import type { AllocationWeights, EquipmentCategory } from '../types/models';

export const ENGINE_VERSION = '2.4.0';

export const DEMO_NOW = '2026-03-02T09:00:00';
export const DEMO_SCENARIO_DAY = '2026-03-03';

export const DEFAULT_WEIGHTS: AllocationWeights = {
  deadline: 0.35,
  necessity: 0.25,
  fairness: 0.20,
  feasibility: 0.15,
  waiting: 0.05,
};

export const DEFAULT_FAIR_USE_LIMIT_HOURS = 10;

export const DEADLINE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 100],
  [24, 100],
  [48, 85],
  [72, 70],
  [120, 50],
  [240, 25],
  [720, 5],
];

export const COMPATIBLE_CATEGORIES: Record<EquipmentCategory, EquipmentCategory[]> = {
  'GPU Workstation': ['GPU Workstation', 'Embedded & IoT'],
  'Robotics': ['Robotics', 'Embedded & IoT'],
  'Embedded & IoT': ['Embedded & IoT', 'FPGA & Hardware', 'GPU Workstation'],
  '3D Printing': ['3D Printing'],
  'Electronics & Test': ['Electronics & Test', 'FPGA & Hardware'],
  'FPGA & Hardware': ['FPGA & Hardware', 'Electronics & Test', 'Embedded & IoT'],
  'Networking': ['Networking'],
  'Research Instrument': ['Research Instrument', 'Electronics & Test'],
};

export function parseIsoMs(iso: string): number {
  return new Date(iso).getTime();
}

export function toDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatLocalIso(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
}

export function parseHourMinute(hhmm: string): { hour: number; minute: number } {
  const [hStr, mStr] = hhmm.split(':');
  return { hour: Number(hStr), minute: Number(mStr) };
}

export function makeDayTimeMs(dateKey: string, hhmm: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const { hour, minute } = parseHourMinute(hhmm);
  return new Date(y, m - 1, d, hour, minute, 0, 0).getTime();
}

export function endOfCalendarDayMs(iso: string): number {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

export function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}
