import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Clock, Compass, ShieldAlert } from 'lucide-react';
import type { Department, Equipment, Laboratory } from '../types/models';
import { getDepartmentTheme } from '../config/departmentThemes';
import { CATEGORY_META } from './CategoryIllustration';
import { AppImage, resolveEquipmentImage } from './ui/AppImage';
import { ProgressBar, StatusBadge, Tooltip } from './ui/Primitives';

export const EquipmentCard: React.FC<{
  equipment: Equipment;
  detailHref?: string;
  department?: Department;
  laboratory?: Laboratory;
  departmentCode?: string;
  laboratoryName?: string;
  actionLabel?: string;
  availabilityPct?: number;
  nextSlot?: string;
  showLocateOnCampus?: boolean;
}> = ({
  equipment,
  detailHref,
  department,
  laboratory,
  departmentCode,
  laboratoryName,
  actionLabel = 'Inspect & Book',
  availabilityPct,
  nextSlot,
  showLocateOnCampus = true,
}) => {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const meta = CATEGORY_META[equipment.category] ?? CATEGORY_META['GPU Workstation'];
  const Icon = meta.icon;
  const theme = getDepartmentTheme(department?.id ?? equipment.departmentId);
  const resolvedImage = useMemo(() => resolveEquipmentImage(equipment), [equipment]);

  const resolvedHref = detailHref ?? `/student/equipment/${equipment.id}`;
  const resolvedDeptCode = departmentCode ?? department?.code ?? theme.code;
  const resolvedLabName = laboratoryName ?? laboratory?.name ?? equipment.building;

  const displayStatus = !equipment.isActive ? 'inactive' : equipment.maintenanceStatus;

  const specChips = Object.entries(equipment.specs)
    .filter(([, v]) => v !== undefined && v !== false)
    .slice(0, 3)
    .map(([k, v]) => (typeof v === 'boolean' ? k.toUpperCase() : `${k}: ${v}`));

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const py = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    setTilt({
      rx: Math.max(-5, Math.min(5, -py * 8)),
      ry: Math.max(-5, Math.min(5, px * 8)),
    });
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ rx: 0, ry: 0 })}
      style={{
        transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        borderTopColor: theme.accent,
        borderTopWidth: '2px',
      }}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#111B2E] transition-transform duration-150 ease-out hover:border-[#3B82F6]/45 shadow-[0_4px_16px_rgba(2,6,23,0.35)]"
    >
      {/* 16:10 Media Slot */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#0B1220]">
        <AppImage
          src={resolvedImage.src}
          focalPoint={resolvedImage.focalPoint}
          alt={equipment.name}
          category={equipment.category}
          departmentId={equipment.departmentId}
          scrim="bottom"
          className="h-full w-full"
          imgClassName="transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md border border-white/15 bg-[#070B14]/85 px-2 py-1 text-[11px] font-mono text-[#F8FAFC]">
          <span style={{ color: theme.accent2 }}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span>{equipment.equipmentId}</span>
        </div>
        <div className="absolute right-3 top-3">
          <StatusBadge status={displayStatus} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#94A3B8]">
          <span className="truncate">
            {equipment.category} ·{' '}
            <span style={{ color: theme.accent2 }}>{resolvedDeptCode}</span>
            {equipment.quantity > 1 ? ` · ${equipment.quantity} units` : ''}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[#64748B] tabular-nums">
            {equipment.minBookingMins}–{equipment.maxBookingMins}m
          </span>
        </div>

        <h3 className="mt-1 line-clamp-1 font-display text-base font-semibold text-[#F8FAFC]">
          {equipment.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#94A3B8]">
          {equipment.description}
        </p>

        {specChips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {specChips.map((chip) => (
              <span
                key={chip}
                className="rounded-md border border-white/[0.08] bg-[#0B1220] px-2 py-0.5 font-mono text-[10px] text-[#CBD5E1]"
              >
                {chip}
              </span>
            ))}
          </div>
        )}

        {typeof availabilityPct === 'number' && (
          <div className="mt-3">
            <ProgressBar
              value={availabilityPct}
              label="Today free window"
              showValue
              color={availabilityPct >= 50 ? '#10B981' : availabilityPct >= 20 ? '#F59E0B' : '#EF4444'}
            />
          </div>
        )}

        <div className="mt-auto pt-3 space-y-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between gap-2 text-xs text-[#94A3B8]">
            <span className="flex items-center gap-1.5 truncate">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
              <span className="truncate">{resolvedLabName}</span>
            </span>

            {(equipment.requiresCertification || equipment.usageRestrictions) && (
              <Tooltip
                content={
                  equipment.usageRestrictions ||
                  `Requires ${equipment.requiredCertification ?? 'lab safety'} certification`
                }
              >
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#FCD34D] shrink-0">
                  <ShieldAlert className="h-3 w-3" />
                  {equipment.requiresCertification ? 'Cert req' : 'Rules'}
                </span>
              </Tooltip>
            )}
          </div>

          {nextSlot && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#CBD5E1]">
              <Clock className="h-3 w-3 shrink-0 text-[#22D3EE]" />
              <span className="truncate">Next slot: {nextSlot}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Link
              to={resolvedHref}
              className="flex flex-1 items-center justify-between rounded-lg border border-white/10 bg-[#17243A] px-3 py-2 text-xs font-medium text-[#F8FAFC] transition-colors hover:border-[#3B82F6]/50 hover:bg-[#1E2F4C] whitespace-nowrap"
            >
              <span>{actionLabel}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#22D3EE] transition-transform duration-150 group-hover:translate-x-0.5" />
            </Link>
            {showLocateOnCampus && (
              <Link
                to={`/student/campus?equipment=${equipment.id}`}
                title="Locate on 3D Campus"
                aria-label={`Locate ${equipment.name} on 3D campus`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#0B1220] text-[#94A3B8] transition-colors hover:border-[#22D3EE]/50 hover:text-[#22D3EE]"
              >
                <Compass className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
