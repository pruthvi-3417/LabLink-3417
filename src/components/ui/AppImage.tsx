import React, { useState } from 'react';
import { IMAGE_MANIFEST, resolveManifestSlotForEquipment, type ImageSlotKey } from '../../config/imageManifest';
import type { Equipment, EquipmentCategory } from '../../types/models';
import { CategoryIllustration } from '../CategoryIllustration';

export function resolveEquipmentImage(
  equipment: Pick<Equipment, 'id' | 'equipmentId' | 'name' | 'category' | 'imageUrl'>
): {
  src: string | null;
  focalPoint: string;
  dominantColor: string;
  slot: ImageSlotKey;
} {
  const slot = resolveManifestSlotForEquipment(equipment);
  const entry = IMAGE_MANIFEST[slot];
  if (equipment.imageUrl) {
    return {
      src: equipment.imageUrl,
      focalPoint: entry?.focalPoint ?? '50% 50%',
      dominantColor: entry?.dominantColor ?? '#0B1220',
      slot,
    };
  }
  if (entry?.hasDedicatedFile && entry.src) {
    return {
      src: entry.src,
      focalPoint: entry.focalPoint,
      dominantColor: entry.dominantColor,
      slot,
    };
  }
  return {
    src: null,
    focalPoint: entry?.focalPoint ?? '50% 50%',
    dominantColor: entry?.dominantColor ?? '#0B1220',
    slot,
  };
}

export const AppImage: React.FC<{
  slot?: ImageSlotKey;
  src?: string | null;
  alt?: string;
  category?: EquipmentCategory;
  departmentId?: string;
  focalPoint?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  scrim?: 'none' | 'subtle' | 'bottom' | 'heavy';
  children?: React.ReactNode;
}> = ({
  slot,
  src,
  alt,
  category,
  departmentId,
  focalPoint,
  className = '',
  imgClassName = '',
  priority = false,
  scrim = 'none',
  children,
}) => {
  const manifest = slot ? IMAGE_MANIFEST[slot] : undefined;
  const resolvedSrc = src !== undefined ? src : manifest?.hasDedicatedFile ? manifest.src : null;
  const resolvedAlt = alt ?? manifest?.alt ?? 'LabLink Campus Resource';
  const resolvedFocal = focalPoint ?? manifest?.focalPoint ?? '50% 50%';
  const dominantColor = manifest?.dominantColor ?? '#0B1220';
  const fallbackCat = category ?? manifest?.fallbackCategory ?? 'GPU Workstation';
  const fallbackDept = departmentId ?? manifest?.fallbackDepartmentId;

  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const showImg = Boolean(resolvedSrc) && !errored;

  const scrimClass =
    scrim === 'heavy'
      ? 'bg-gradient-to-b from-[#070B14]/75 via-[#070B14]/82 to-[#070B14]/94'
      : scrim === 'bottom'
      ? 'bg-gradient-to-t from-[#070B14]/92 via-[#070B14]/35 to-transparent'
      : scrim === 'subtle'
      ? 'bg-gradient-to-t from-[#070B14]/70 via-[#070B14]/20 to-transparent'
      : '';

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: dominantColor }}
    >
      {showImg ? (
        <img
          src={resolvedSrc!}
          alt={resolvedAlt}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{ objectPosition: resolvedFocal }}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          } ${imgClassName}`}
        />
      ) : (
        <CategoryIllustration
          category={fallbackCat}
          departmentId={fallbackDept}
          label={alt}
          className="h-full w-full"
        />
      )}
      {scrim !== 'none' && <div className={`pointer-events-none absolute inset-0 ${scrimClass}`} />}
      {children}
    </div>
  );
};
