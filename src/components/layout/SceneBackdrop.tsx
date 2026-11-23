import React, { useEffect, useRef, useState } from 'react';
import { getDepartmentTheme } from '../../config/departmentThemes';
import type { ImageSlotKey } from '../../config/imageManifest';
import { AppImage } from '../ui/AppImage';

export type BackdropTier = 'A' | 'B' | 'C';

export const SceneBackdrop: React.FC<{
  tier?: BackdropTier;
  imageSlot?: ImageSlotKey;
  departmentId?: string;
  interactive3D?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({
  tier = 'C',
  imageSlot = 'campus/dusk-wide',
  departmentId,
  interactive3D,
  children,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0 });
  const deptTheme = departmentId ? getDepartmentTheme(departmentId) : null;

  useEffect(() => {
    if (tier !== 'B') return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const handleMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 14;
      const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 10;
      setPointerOffset({ x: nx, y: ny });
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [tier]);

  if (tier === 'A') {
    return (
      <div ref={containerRef} className={`relative min-h-screen bg-[#070B14] text-[#F8FAFC] ${className}`}>
        {interactive3D && <div className="absolute inset-0 z-0">{interactive3D}</div>}
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  if (tier === 'B') {
    return (
      <div ref={containerRef} className={`relative min-h-screen bg-[#070B14] text-[#F8FAFC] overflow-x-clip ${className}`}>
        {/* 2-layer parallax atmospheric backdrop */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute -inset-6 transition-transform duration-300 ease-out will-change-transform"
            style={{
              transform: `translate3d(${-pointerOffset.x * 0.6}px, ${-pointerOffset.y * 0.6}px, 0) scale(1.04)`,
            }}
          >
            <AppImage
              slot={imageSlot}
              departmentId={departmentId}
              className="h-full w-full"
              imgClassName="blur-[2px] opacity-40"
              priority
            />
          </div>

          <div
            className="absolute inset-0 transition-transform duration-300 ease-out will-change-transform"
            style={{
              transform: `translate3d(${pointerOffset.x * 0.35}px, ${pointerOffset.y * 0.35}px, 0)`,
              background: deptTheme
                ? `radial-gradient(ellipse 75% 45% at 50% 0%, ${deptTheme.surfaceTint}, transparent 70%)`
                : 'radial-gradient(ellipse 75% 45% at 50% 0%, rgba(59,130,246,0.12), transparent 70%)',
            }}
          />

          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(7,11,20,0.72) 0%, rgba(7,11,20,0.84) 48%, rgba(7,11,20,0.94) 100%)',
            }}
          />
        </div>

        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  // Tier C — Operational clarity with optional 200px department-tinted header band (6-10% opacity)
  return (
    <div ref={containerRef} className={`relative min-h-screen bg-[#070B14] text-[#F8FAFC] ${className}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[200px] z-0"
        aria-hidden="true"
        style={{
          background: deptTheme
            ? `linear-gradient(180deg, ${deptTheme.surfaceTint} 0%, rgba(7,11,20,0) 100%)`
            : 'linear-gradient(180deg, rgba(59,130,246,0.06) 0%, rgba(7,11,20,0) 100%)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
};
