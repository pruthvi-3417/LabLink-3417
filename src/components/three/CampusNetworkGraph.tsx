import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createNodeLabelTexture, detectWebGLProfile, useVisibilityPause } from './webglUtils';

export interface NetworkLabNode {
  id: string;
  name: string;
  departmentCode: string;
  utilizationPct: number;
  equipmentCount: number;
}

export interface NetworkLink {
  fromLabId: string;
  toLabId: string;
  weight: number;
}

function nodeColorForUtil(utilizationPct: number): string {
  return utilizationPct >= 60 ? '#22D3EE' : utilizationPct >= 25 ? '#3B82F6' : '#8B5CF6';
}

function LabNodeSprite({
  code,
  utilizationPct,
  color,
  highlighted,
  yOffset,
}: {
  code: string;
  utilizationPct: number;
  color: string;
  highlighted: boolean;
  yOffset: number;
}) {
  const texture = useMemo(
    () => createNodeLabelTexture(`${code} · ${utilizationPct}%`, undefined, color, highlighted),
    [code, utilizationPct, color, highlighted]
  );

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) return null;

  return (
    <sprite position={[0, yOffset, 0]} scale={highlighted ? [1.35, 0.34, 1] : [1.15, 0.28, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function NetworkGraphInner({
  labs,
  links,
  reducedMotion,
  activeLabId,
  onHoverLab,
  onSelectLab,
}: {
  labs: NetworkLabNode[];
  links: NetworkLink[];
  reducedMotion: boolean;
  activeLabId: string | null;
  onHoverLab: (id: string | null) => void;
  onSelectLab: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const positions = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    const count = Math.max(1, labs.length);
    labs.forEach((lab, i) => {
      const angle = (i / count) * Math.PI * 2;
      const radius = 2.25;
      const y = (i % 2 === 0 ? 1 : -1) * 0.42;
      map.set(lab.id, [Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
    });
    return map;
  }, [labs]);

  useFrame((_, delta) => {
    if (groupRef.current && !reducedMotion && !activeLabId) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.95, 0]}>
        <ringGeometry args={[2.15, 2.25, 64]} />
        <meshBasicMaterial color="#1E3A5F" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>

      {labs.map((lab) => {
        const pos = positions.get(lab.id) ?? [0, 0, 0];
        const radius = 0.22 + Math.min(0.28, (lab.utilizationPct / 100) * 0.25);
        const color = nodeColorForUtil(lab.utilizationPct);
        const isHighlighted = activeLabId === lab.id;
        return (
          <group
            key={lab.id}
            position={pos}
            scale={isHighlighted ? 1.18 : 1}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHoverLab(lab.id);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              onHoverLab(null);
              document.body.style.cursor = 'auto';
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectLab(lab.id);
            }}
          >
            <mesh>
              <sphereGeometry args={[radius, 20, 20]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isHighlighted ? 0.95 : 0.6}
                roughness={0.25}
                metalness={0.35}
              />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[radius + 0.12, 0.02, 8, 28]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isHighlighted ? 0.8 : 0.35}
                transparent
                opacity={isHighlighted ? 0.9 : 0.5}
              />
            </mesh>
            <LabNodeSprite
              code={lab.departmentCode}
              utilizationPct={lab.utilizationPct}
              color={color}
              highlighted={isHighlighted}
              yOffset={radius + 0.34}
            />
          </group>
        );
      })}

      {links.map((lk, idx) => {
        const p1 = positions.get(lk.fromLabId);
        const p2 = positions.get(lk.toLabId);
        if (!p1 || !p2) return null;
        const connected = activeLabId && (lk.fromLabId === activeLabId || lk.toLabId === activeLabId);
        const dimmed = Boolean(activeLabId && !connected);
        return (
          <Line
            key={idx}
            points={[p1, p2]}
            color={connected ? '#22D3EE' : '#3B82F6'}
            lineWidth={connected ? 2.6 : Math.min(2.4, 1 + lk.weight * 0.35)}
            transparent
            opacity={connected ? 0.92 : dimmed ? 0.14 : 0.45}
          />
        );
      })}
    </group>
  );
}

export const CampusNetworkGraph: React.FC<{
  labs: NetworkLabNode[];
  links: NetworkLink[];
}> = ({ labs, links }) => {
  const profile = useMemo(() => detectWebGLProfile(), []);
  const { ref, visible } = useVisibilityPause();
  const [hoveredLabId, setHoveredLabId] = useState<string | null>(null);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const activeLabId = hoveredLabId ?? selectedLabId;

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  if (!profile.supported) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {labs.map((l) => (
          <div key={l.id} className="rounded-lg border border-white/10 bg-[#0D1424] p-3">
            <div className="text-xs font-semibold text-[#F8FAFC]">{l.name}</div>
            <div className="mt-1 text-[11px] tabular-nums text-[#22D3EE]">
              {l.departmentCode} · {l.utilizationPct}% util · {l.equipmentCount} assets
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="w-full rounded-xl overflow-hidden bg-[#080D19] border border-white/[0.08]">
      <div className="relative h-64 w-full">
        <Canvas
          dpr={profile.isSoftware ? 1 : [1, 1.5]}
          gl={{ antialias: !profile.isSoftware }}
          camera={{ position: [0, 2.5, 6.0], fov: 44 }}
          frameloop={visible && !profile.reducedMotion && !profile.isSoftware ? 'always' : 'demand'}
          onPointerMissed={() => setSelectedLabId(null)}
        >
          <color attach="background" args={['#080D19']} />
          <hemisphereLight args={['#38BDF8', '#080D19', 0.65]} />
          <directionalLight position={[4, 5, 4]} intensity={1.1} color="#F8FAFC" />
          <pointLight position={[-3, 3, 2]} intensity={0.95} color="#22D3EE" />
          <NetworkGraphInner
            labs={labs}
            links={links}
            reducedMotion={profile.reducedMotion}
            activeLabId={activeLabId}
            onHoverLab={setHoveredLabId}
            onSelectLab={(id) => setSelectedLabId((prev) => (prev === id ? null : id))}
          />
          <OrbitControls enableZoom={false} enablePan={false} />
        </Canvas>
        <div className="pointer-events-none absolute left-3 top-2.5 text-[11px] text-[#94A3B8]">
          Click or hover a lab node to isolate cross-department flows
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-white/[0.08] bg-[#0D1424]/85 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {labs.map((lab) => {
          const dotColor = nodeColorForUtil(lab.utilizationPct);
          const isActive = activeLabId === lab.id;
          return (
            <button
              key={lab.id}
              type="button"
              onMouseEnter={() => setHoveredLabId(lab.id)}
              onMouseLeave={() => setHoveredLabId(null)}
              onClick={() => setSelectedLabId((prev) => (prev === lab.id ? null : lab.id))}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                isActive
                  ? 'border-[#22D3EE]/55 bg-[#17243A]'
                  : 'border-white/[0.06] bg-[#080D19]/75 hover:border-white/15'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                <span className="truncate font-medium text-[#F8FAFC]">
                  {lab.departmentCode} · {lab.name}
                </span>
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-[#22D3EE]">
                {lab.utilizationPct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CampusNetworkGraph;

