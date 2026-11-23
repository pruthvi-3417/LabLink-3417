import React, { useState } from 'react';
import {
  Activity,
  Bot,
  Cpu,
  FlaskConical,
  HardDrive,
  Network,
  Printer,
  Wrench,
} from 'lucide-react';
import type { EquipmentCategory } from '../types/models';
import { getDepartmentTheme } from '../config/departmentThemes';

export const CATEGORY_META: Record<
  EquipmentCategory,
  { accent: string; shortDesc: string; icon: React.ComponentType<{ className?: string }> }
> = {
  'GPU Workstation': {
    accent: '#3B82F6',
    shortDesc: 'Multi-GPU compute nodes, CUDA workstations & training rigs',
    icon: Cpu,
  },
  Robotics: {
    accent: '#8B5CF6',
    shortDesc: '6-axis manipulators, ROS2 mobile platforms & 3D LiDAR',
    icon: Bot,
  },
  'Embedded & IoT': {
    accent: '#22D3EE',
    shortDesc: 'Jetson Orin kits, STM32 DSP, LoRaWAN & sensor arrays',
    icon: HardDrive,
  },
  '3D Printing': {
    accent: '#10B981',
    shortDesc: 'CoreXY FFF, optical SLA resin & 5-axis desktop CNC',
    icon: Printer,
  },
  'Electronics & Test': {
    accent: '#22D3EE',
    shortDesc: '1GHz mixed-signal scopes, spectrum analyzers & logic capture',
    icon: Activity,
  },
  'FPGA & Hardware': {
    accent: '#3B82F6',
    shortDesc: 'Zynq UltraScale+, Alveo accelerators & RISC-V trainers',
    icon: Wrench,
  },
  Networking: {
    accent: '#6366F1',
    shortDesc: 'Programmable SDN testbeds & USRP software-defined radios',
    icon: Network,
  },
  'Research Instrument': {
    accent: '#10B981',
    shortDesc: 'FLIR thermal cameras, tensile testers & motion-capture',
    icon: FlaskConical,
  },
};

export const CategoryIllustration: React.FC<{
  category?: EquipmentCategory;
  departmentId?: string;
  label?: string;
  className?: string;
}> = ({ category = 'GPU Workstation', departmentId, label, className = '' }) => {
  const meta = CATEGORY_META[category] ?? CATEGORY_META['GPU Workstation'];
  const deptTheme = departmentId ? getDepartmentTheme(departmentId) : null;
  const accent = deptTheme?.accent ?? meta.accent;
  const accent2 = deptTheme?.accent2 ?? '#22D3EE';
  const Icon = meta.icon;

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#070B14] via-[#0E1729] to-[#152238] ${className}`}
    >
      <svg
        className="absolute inset-0 h-full w-full opacity-40"
        viewBox="0 0 400 260"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern id="ll-iso-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="0.7" />
          </pattern>
          <radialGradient id="ll-iso-glow" cx="50%" cy="46%" r="55%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor="#070B14" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="260" fill="url(#ll-iso-grid)" />
        <rect width="400" height="260" fill="url(#ll-iso-glow)" />
        {/* Isometric technical wireframe silhouette */}
        <g stroke={accent2} strokeOpacity="0.38" fill="none" strokeWidth="1.2">
          <polygon points="200,56 266,94 200,132 134,94" />
          <polygon points="134,94 200,132 200,196 134,158" />
          <polygon points="266,94 200,132 200,196 266,158" />
          <line x1="200" y1="56" x2="200" y2="196" strokeDasharray="3 3" />
          <circle cx="200" cy="126" r="54" stroke={accent} strokeOpacity="0.22" />
        </g>
      </svg>

      <div className="relative z-10 flex flex-col items-center gap-2 px-4 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-[#070B14]/85 shadow-lg"
          style={{ color: accent }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <span className="text-xs font-medium text-[#CBD5E1]">{label ?? deptTheme?.name ?? category}</span>
      </div>
    </div>
  );
};

export const EquipmentImage: React.FC<{
  src?: string;
  alt: string;
  category: EquipmentCategory;
  className?: string;
}> = ({ src, alt, category, className = 'h-44 w-full' }) => {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`relative overflow-hidden bg-[#0B1220] ${className}`}>
      {!failed && src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-300"
        />
      ) : (
        <CategoryIllustration category={category} />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070B14]/90 via-[#070B14]/25 to-transparent" />
    </div>
  );
};
