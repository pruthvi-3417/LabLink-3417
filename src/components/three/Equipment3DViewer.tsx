import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { Equipment, EquipmentCategory } from '../../types/models';
import { CategoryIllustration } from '../CategoryIllustration';
import { EquipmentModelBySpec } from '../../three/models/categoryToModel';
import { StudioEnvironment } from '../../three/models/sharedMaterials';
import { detectWebGLProfile, useVisibilityPause } from './webglUtils';

type ViewPreset = 'iso' | 'front' | 'top';

const PRESET_VECTORS: Record<ViewPreset, [number, number, number]> = {
  iso: [2.3, 1.5, 2.7],
  front: [0, 0.75, 3.2],
  top: [0.01, 3.3, 0.85],
};

function TurntableModel({
  equipment,
  category,
  accent,
  autoSpin,
}: {
  equipment?: Partial<Pick<Equipment, 'id' | 'equipmentId' | 'name' | 'category'>> | null;
  category: EquipmentCategory;
  accent?: string;
  autoSpin: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current && autoSpin) {
      groupRef.current.rotation.y += delta * 0.35;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.58, 0]}>
      <EquipmentModelBySpec
        equipment={equipment}
        category={category}
        accent={accent}
        animate={autoSpin}
      />
    </group>
  );
}

function ViewerCameraRig({
  preset,
  easingActive,
  controlsRef,
  onDone,
}: {
  preset: ViewPreset;
  easingActive: boolean;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  onDone: () => void;
}) {
  const { camera } = useThree();
  const target = PRESET_VECTORS[preset];

  useFrame((_, delta) => {
    if (!easingActive) return;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, target[0], 6, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, target[1], 6, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, target[2], 6, delta);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    const dist = Math.hypot(
      camera.position.x - target[0],
      camera.position.y - target[1],
      camera.position.z - target[2]
    );
    if (dist < 0.04) onDone();
  });

  return null;
}

export const Equipment3DViewer: React.FC<{
  category: EquipmentCategory;
  equipment?: Partial<Pick<Equipment, 'id' | 'equipmentId' | 'name' | 'category'>> | null;
  accent?: string;
}> = ({ category, equipment, accent }) => {
  const profile = useMemo(() => detectWebGLProfile(), []);
  const { ref, visible } = useVisibilityPause();
  const [interacted, setInteracted] = useState(false);
  const [spinEnabled, setSpinEnabled] = useState(true);
  const [preset, setPreset] = useState<ViewPreset>('iso');
  const [easingActive, setEasingActive] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  if (!profile.supported) {
    return <CategoryIllustration category={category} className="h-full w-full rounded-xl" />;
  }

  const selectPreset = (next: ViewPreset) => {
    setPreset(next);
    setEasingActive(true);
  };

  return (
    <div
      ref={ref}
      className="relative h-full w-full min-h-[280px] rounded-xl overflow-hidden bg-[#070B14] border border-white/[0.08]"
    >
      <Canvas
        dpr={profile.isSoftware ? 1 : [1, 1.5]}
        gl={{ antialias: !profile.isSoftware, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ position: PRESET_VECTORS.iso, fov: 42 }}
        frameloop={
          visible && !profile.reducedMotion && !profile.isSoftware && spinEnabled
            ? 'always'
            : 'demand'
        }
      >
        <color attach="background" args={['#070B14']} />
        <StudioEnvironment />
        <hemisphereLight args={['#38BDF8', '#070B14', 0.6]} />
        <directionalLight position={[4, 5, 3]} intensity={1.35} color="#FFF7ED" />
        <pointLight position={[-3, 2, -2]} intensity={0.95} color={accent ?? '#22D3EE'} />
        {/* Grounded contact turntable disc */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.62, 0]}>
          <circleGeometry args={[1.15, 48]} />
          <meshStandardMaterial color="#0B1220" roughness={0.65} metalness={0.3} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
          <ringGeometry args={[1.08, 1.15, 48]} />
          <meshBasicMaterial color={accent ?? '#22D3EE'} transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>

        <TurntableModel
          equipment={equipment}
          category={category}
          accent={accent}
          autoSpin={!profile.reducedMotion && !interacted && spinEnabled}
        />

        <ViewerCameraRig
          preset={preset}
          easingActive={easingActive}
          controlsRef={controlsRef}
          onDone={() => setEasingActive(false)}
        />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={2.0}
          maxDistance={5.0}
          onStart={() => {
            setInteracted(true);
            setEasingActive(false);
          }}
        />
      </Canvas>

      {/* Bottom compact camera & spin dock (no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#94A3B8]">Drag to orbit · Scroll to zoom</span>
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/12 bg-[#0B1220]/90 p-1 text-[11px]">
          {(['iso', 'front', 'top'] as ViewPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => selectPreset(p)}
              className={`rounded px-2 py-0.5 uppercase font-mono transition-colors cursor-pointer ${
                preset === p ? 'bg-[#17243A] text-[#22D3EE]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setInteracted(false);
              setSpinEnabled((s) => !s);
            }}
            className={`rounded px-2 py-0.5 font-mono transition-colors cursor-pointer ${
              spinEnabled ? 'text-[#6EE7B7]' : 'text-[#64748B] hover:text-[#F8FAFC]'
            }`}
          >
            {spinEnabled ? 'Spin' : 'Paused'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Equipment3DViewer;
