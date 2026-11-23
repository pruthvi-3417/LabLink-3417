import type React from 'react';
import type { ImageSlotKey } from './imageManifest';

export type DepartmentSlug = 'dept-aiml' | 'dept-cse' | 'dept-ece' | 'dept-mech' | 'dept-robo';

export interface DepartmentTheme {
  id: DepartmentSlug;
  code: 'AIML' | 'CSE' | 'ECE' | 'MECH' | 'ROBO';
  name: string;
  shortName: string;
  building: string;
  tagline: string;
  accent: string;
  accent2: string;
  surfaceTint: string;
  heroSlot: ImageSlotKey;
  campusPosition: [number, number, number];
  buildingHeight: number;
  propSet: string[];
}

export const DEPARTMENT_THEMES: Record<DepartmentSlug, DepartmentTheme> = {
  'dept-aiml': {
    id: 'dept-aiml',
    code: 'AIML',
    name: 'AI & Machine Learning',
    shortName: 'AI & ML',
    building: 'Turing Center',
    tagline: 'Deep learning compute bays, tensor clusters, and inference testbeds.',
    accent: '#3B82F6',
    accent2: '#22D3EE',
    surfaceTint: 'rgba(59, 130, 246, 0.09)',
    heroSlot: 'departments/aiml',
    campusPosition: [-5.4, 0, -2.6],
    buildingHeight: 3.4,
    propSet: ['gpu-workstation', 'server-rack', 'jetson'],
  },
  'dept-cse': {
    id: 'dept-cse',
    code: 'CSE',
    name: 'Computer Science & Engineering',
    shortName: 'Computer Science',
    building: 'Turing Center',
    tagline: 'GPU computing racks, programmable SDN fabrics, and hardware accelerators.',
    accent: '#6366F1',
    accent2: '#3B82F6',
    surfaceTint: 'rgba(99, 102, 241, 0.09)',
    heroSlot: 'departments/cse',
    campusPosition: [0, 0, -4.4],
    buildingHeight: 3.8,
    propSet: ['server-rack', 'network-switch', 'fpga', 'gpu-workstation'],
  },
  'dept-ece': {
    id: 'dept-ece',
    code: 'ECE',
    name: 'Electronics & Communication',
    shortName: 'Electronics & IoT',
    building: 'Maxwell Hall',
    tagline: '1GHz mixed-signal scopes, FPGA verification benches, and LoRaWAN nodes.',
    accent: '#22D3EE',
    accent2: '#14B8A6',
    surfaceTint: 'rgba(34, 211, 238, 0.08)',
    heroSlot: 'departments/ece',
    campusPosition: [5.4, 0, -2.2],
    buildingHeight: 2.9,
    propSet: ['oscilloscope', 'fpga', 'circuit-board', 'esp32'],
  },
  'dept-mech': {
    id: 'dept-mech',
    code: 'MECH',
    name: 'Mechanical Engineering',
    shortName: 'Mechanical & Fab',
    building: 'Watt Pavilion',
    tagline: 'CoreXY additive cells, optical SLA resin bays, and 5-axis CNC machining.',
    accent: '#F97316',
    accent2: '#FB923C',
    surfaceTint: 'rgba(249, 115, 22, 0.08)',
    heroSlot: 'departments/mech',
    campusPosition: [-4.0, 0, 3.6],
    buildingHeight: 2.5,
    propSet: ['3d-printer', 'cnc-machine', 'cad-workstation'],
  },
  'dept-robo': {
    id: 'dept-robo',
    code: 'ROBO',
    name: 'Robotics & Automation',
    shortName: 'Robotics',
    building: 'Asimov Block',
    tagline: '6-DOF collaborative workcells, ROS2 mobile rovers, and 3D LiDAR arenas.',
    accent: '#8B5CF6',
    accent2: '#3B82F6',
    surfaceTint: 'rgba(139, 92, 246, 0.09)',
    heroSlot: 'departments/robotics',
    campusPosition: [4.2, 0, 3.4],
    buildingHeight: 3.1,
    propSet: ['robotic-arm', 'mobile-robot', 'lidar'],
  },
};

export const DEPARTMENT_THEME_LIST: DepartmentTheme[] = [
  DEPARTMENT_THEMES['dept-aiml'],
  DEPARTMENT_THEMES['dept-cse'],
  DEPARTMENT_THEMES['dept-ece'],
  DEPARTMENT_THEMES['dept-mech'],
  DEPARTMENT_THEMES['dept-robo'],
];

export function getDepartmentTheme(idOrCode?: string | null): DepartmentTheme {
  if (!idOrCode) return DEPARTMENT_THEMES['dept-aiml'];
  const norm = idOrCode.trim().toLowerCase();
  if (norm in DEPARTMENT_THEMES) {
    return DEPARTMENT_THEMES[norm as DepartmentSlug];
  }
  const byCode = DEPARTMENT_THEME_LIST.find(
    (d) =>
      d.code.toLowerCase() === norm ||
      d.id.replace('dept-', '') === norm ||
      d.name.toLowerCase() === norm
  );
  return byCode ?? DEPARTMENT_THEMES['dept-aiml'];
}

export function getDepartmentCssVars(idOrCode?: string | null): React.CSSProperties {
  const theme = getDepartmentTheme(idOrCode);
  return {
    '--dept-accent': theme.accent,
    '--dept-accent2': theme.accent2,
  } as React.CSSProperties;
}
