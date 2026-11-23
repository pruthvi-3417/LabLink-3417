import React from 'react';
import type { Equipment, EquipmentCategory } from '../../types/models';
import {
  CadWorkstation,
  CircuitBoard,
  CncMachine,
  DevBoard,
  FpgaBoard,
  GenericInstrument,
  GpuWorkstation,
  JetsonModule,
  Lidar,
  MobileRobot,
  NetworkSwitch,
  Oscilloscope,
  RoboticArm,
  ServerRack,
  ThreeDPrinter,
} from './EquipmentParts';

export type EquipmentModelKind =
  | 'gpu-workstation'
  | 'server-rack'
  | 'robotic-arm'
  | 'mobile-robot'
  | 'lidar'
  | '3d-printer'
  | 'oscilloscope'
  | 'circuit-board'
  | 'fpga-board'
  | 'dev-board'
  | 'jetson-module'
  | 'network-switch'
  | 'cnc-machine'
  | 'cad-workstation'
  | 'generic-instrument';

export function resolveEquipmentModelKind(
  equipment?: Partial<Pick<Equipment, 'id' | 'equipmentId' | 'name' | 'category'>> | null,
  fallbackCategory?: EquipmentCategory
): EquipmentModelKind {
  const hay = `${equipment?.id ?? ''} ${equipment?.equipmentId ?? ''} ${equipment?.name ?? ''}`.toLowerCase();
  const cat = equipment?.category ?? fallbackCategory ?? 'GPU Workstation';

  if (hay.includes('jetson')) return 'jetson-module';
  if (hay.includes('dgx') || hay.includes('rack') || hay.includes('server')) return 'server-rack';
  if (hay.includes('cad')) return 'cad-workstation';
  if (hay.includes('lidar')) return 'lidar';
  if (hay.includes('amr') || hay.includes('rover') || hay.includes('mobile') || hay.includes('quadrotor')) {
    return 'mobile-robot';
  }
  if (hay.includes('cnc')) return 'cnc-machine';
  if (hay.includes('arduino') || hay.includes('raspberry') || hay.includes('stm32') || hay.includes('esp32')) {
    return 'dev-board';
  }
  if (cat === 'GPU Workstation') return 'gpu-workstation';
  if (cat === 'Robotics') return 'robotic-arm';
  if (cat === '3D Printing') return '3d-printer';
  if (cat === 'Electronics & Test') return 'oscilloscope';
  if (cat === 'FPGA & Hardware') return 'fpga-board';
  if (cat === 'Embedded & IoT') return 'circuit-board';
  if (cat === 'Networking') return 'network-switch';
  if (cat === 'Research Instrument') return 'generic-instrument';
  return 'generic-instrument';
}

export const EquipmentModelBySpec: React.FC<{
  equipment?: Partial<Pick<Equipment, 'id' | 'equipmentId' | 'name' | 'category'>> | null;
  category?: EquipmentCategory;
  accent?: string;
  animate?: boolean;
}> = ({ equipment, category, accent, animate = true }) => {
  const kind = resolveEquipmentModelKind(equipment, category);
  switch (kind) {
    case 'gpu-workstation':
      return <GpuWorkstation accent={accent} animate={animate} />;
    case 'server-rack':
      return <ServerRack accent={accent} animate={animate} />;
    case 'robotic-arm':
      return <RoboticArm accent={accent} animate={animate} />;
    case 'mobile-robot':
      return <MobileRobot accent={accent} animate={animate} />;
    case 'lidar':
      return <Lidar accent={accent} animate={animate} />;
    case '3d-printer':
      return <ThreeDPrinter accent={accent} animate={animate} />;
    case 'oscilloscope':
      return <Oscilloscope accent={accent} animate={animate} />;
    case 'circuit-board':
      return <CircuitBoard accent={accent} animate={animate} />;
    case 'fpga-board':
      return <FpgaBoard accent={accent} animate={animate} />;
    case 'dev-board':
      return <DevBoard accent={accent} animate={animate} />;
    case 'jetson-module':
      return <JetsonModule accent={accent} animate={animate} />;
    case 'network-switch':
      return <NetworkSwitch accent={accent} animate={animate} />;
    case 'cnc-machine':
      return <CncMachine accent={accent} animate={animate} />;
    case 'cad-workstation':
      return <CadWorkstation accent={accent} animate={animate} />;
    default:
      return <GenericInstrument accent={accent} animate={animate} />;
  }
};
