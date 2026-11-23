import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { createNodeLabelTexture, detectWebGLProfile, useVisibilityPause } from './webglUtils';

export type TwinStationId = 'hub' | 'gpu' | 'robotics' | 'printer' | 'oscilloscope';

export interface TwinStationMeta {
  id: TwinStationId;
  code: string;
  label: string;
  labName: string;
  departmentCode: string;
  accent: string;
  position: [number, number, number];
  cameraOffset: [number, number, number];
}

export const TWIN_STATIONS: TwinStationMeta[] = [
  {
    id: 'hub',
    code: 'NEXUS-CORE',
    label: 'Campus Allocation Core',
    labName: 'Deterministic Engine · 12 Rules',
    departmentCode: 'ALL',
    accent: '#22D3EE',
    position: [0, 0, 0],
    cameraOffset: [0, 1.4, 6.2],
  },
  {
    id: 'gpu',
    code: 'GPU-WS-01',
    label: 'NVIDIA A100 Cluster',
    labName: 'AI & Deep Learning Lab',
    departmentCode: 'CSE',
    accent: '#3B82F6',
    position: [2.25, 0.35, 0.25],
    cameraOffset: [3.6, 1.4, 2.8],
  },
  {
    id: 'robotics',
    code: 'ROBO-ARM-01',
    label: 'UR5e 6-DOF Arm',
    labName: 'Autonomous Robotics Studio',
    departmentCode: 'MECH',
    accent: '#8B5CF6',
    position: [-2.15, 0.25, 0.55],
    cameraOffset: [-3.5, 1.4, 3.0],
  },
  {
    id: 'printer',
    code: '3DP-COREXY-01',
    label: 'Bambu X1E CoreXY',
    labName: 'Rapid Prototyping & FabLab',
    departmentCode: 'PROD',
    accent: '#10B981',
    position: [1.35, -0.35, -1.65],
    cameraOffset: [2.8, 1.2, 0.9],
  },
  {
    id: 'oscilloscope',
    code: 'SCOPE-MSO-01',
    label: 'Tektronix MSO64B',
    labName: 'VLSI & Instrumentation Lab',
    departmentCode: 'ECE',
    accent: '#22D3EE',
    position: [-1.45, -0.3, -1.55],
    cameraOffset: [-2.9, 1.2, 1.0],
  },
];

function StationSpriteLabel({
  title,
  subtitle,
  accent,
  highlighted,
  yOffset,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  highlighted: boolean;
  yOffset: number;
}) {
  const texture = useMemo(
    () => createNodeLabelTexture(title, subtitle, accent, highlighted),
    [title, subtitle, accent, highlighted]
  );

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) return null;

  return (
    <sprite position={[0, yOffset, 0]} scale={highlighted ? [1.75, 0.52, 1] : [1.55, 0.45, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function StationPedestal({ accent, active }: { accent: string; active: boolean }) {
  return (
    <group position={[0, -0.72, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.48, active ? 0.56 : 0.53, 32]} />
        <meshBasicMaterial color={accent} transparent opacity={active ? 0.85 : 0.32} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.48, 0.52, 0.06, 24]} />
        <meshStandardMaterial color="#0D1424" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

function GPUWorkstationMesh() {
  const fanRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (fanRef.current) fanRef.current.rotation.z += delta * 2.2;
  });
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.9, 1.15, 0.52]} />
        <meshStandardMaterial color="#17243A" metalness={0.6} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0, 0.27]}>
        <boxGeometry args={[0.8, 1.0, 0.04]} />
        <meshStandardMaterial color="#0D1424" metalness={0.25} roughness={0.2} />
      </mesh>
      <mesh position={[-0.3, 0, 0.29]}>
        <boxGeometry args={[0.04, 0.9, 0.02]} />
        <meshStandardMaterial color="#22D3EE" emissive="#22D3EE" emissiveIntensity={1.1} />
      </mesh>
      <mesh ref={fanRef} position={[0.06, 0.15, 0.295]}>
        <torusGeometry args={[0.18, 0.03, 8, 18]} />
        <meshStandardMaterial color="#3B82F6" emissive="#3B82F6" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0.06, -0.25, 0.295]}>
        <torusGeometry args={[0.14, 0.025, 8, 16]} />
        <meshStandardMaterial color="#8B5CF6" emissive="#8B5CF6" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

function RoboticArmMesh() {
  const jointRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (jointRef.current) {
      jointRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.6) * 0.45;
    }
  });
  return (
    <group>
      <mesh position={[0, -0.45, 0]}>
        <cylinderGeometry args={[0.35, 0.42, 0.2, 20]} />
        <meshStandardMaterial color="#1E293B" metalness={0.7} roughness={0.3} />
      </mesh>
      <group ref={jointRef} position={[0, -0.35, 0]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.16, 0.7, 0.16]} />
          <meshStandardMaterial color="#3B82F6" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.7, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.11, 0.11, 0.22, 16]} />
          <meshStandardMaterial color="#22D3EE" emissive="#22D3EE" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0.25, 0.88, 0]} rotation={[0, 0, -0.65]}>
          <boxGeometry args={[0.12, 0.62, 0.12]} />
          <meshStandardMaterial color="#94A3B8" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function PrinterFrameMesh() {
  const headRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (headRef.current) {
      headRef.current.position.x = Math.sin(clock.getElapsedTime() * 1.4) * 0.22;
    }
  });
  return (
    <group>
      <mesh position={[-0.4, 0, -0.4]}><boxGeometry args={[0.07, 0.95, 0.07]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[0.4, 0, -0.4]}><boxGeometry args={[0.07, 0.95, 0.07]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[-0.4, 0, 0.4]}><boxGeometry args={[0.07, 0.95, 0.07]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[0.4, 0, 0.4]}><boxGeometry args={[0.07, 0.95, 0.07]} /><meshStandardMaterial color="#334155" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[0, 0.46, 0]}><boxGeometry args={[0.88, 0.06, 0.88]} /><meshStandardMaterial color="#1E293B" /></mesh>
      <mesh position={[0, -0.35, 0]}><boxGeometry args={[0.72, 0.05, 0.72]} /><meshStandardMaterial color="#0F172A" /></mesh>
      <mesh ref={headRef} position={[0, 0.12, 0]}>
        <boxGeometry args={[0.18, 0.16, 0.18]} />
        <meshStandardMaterial color="#10B981" emissive="#10B981" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function OscilloscopeMesh() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.95, 0.62, 0.42]} />
        <meshStandardMaterial color="#1E293B" metalness={0.45} roughness={0.4} />
      </mesh>
      <mesh position={[-0.12, 0.04, 0.22]}>
        <planeGeometry args={[0.52, 0.38]} />
        <meshStandardMaterial color="#082F49" emissive="#22D3EE" emissiveIntensity={0.65} />
      </mesh>
      <mesh position={[0.3, 0.12, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 14]} />
        <meshStandardMaterial color="#94A3B8" />
      </mesh>
      <mesh position={[0.3, -0.06, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 14]} />
        <meshStandardMaterial color="#3B82F6" />
      </mesh>
    </group>
  );
}

function InteractiveStation({
  meta,
  active,
  hovered,
  onHover,
  onSelect,
  children,
  labelY = 0.95,
}: {
  meta: TwinStationMeta;
  active: boolean;
  hovered: boolean;
  onHover: (id: TwinStationId | null) => void;
  onSelect: (id: TwinStationId) => void;
  children: React.ReactNode;
  labelY?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const highlighted = active || hovered;

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const targetScale = active ? 1.09 : hovered ? 1.05 : 1.0;
    const next = THREE.MathUtils.damp(groupRef.current.scale.x, targetScale, 8, delta);
    groupRef.current.scale.setScalar(next);
  });

  return (
    <group
      ref={groupRef}
      position={meta.position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(meta.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(meta.id);
      }}
    >
      {children}
      <StationPedestal accent={meta.accent} active={highlighted} />
      <StationSpriteLabel
        title={meta.code}
        subtitle={meta.departmentCode === 'ALL' ? 'Allocation Hub' : `${meta.departmentCode} · ${meta.label.split(' ')[0]}`}
        accent={meta.accent}
        highlighted={highlighted}
        yOffset={labelY}
      />
    </group>
  );
}

function CameraRig({
  selectedStation,
  controlsRef,
  userInteractedRef,
}: {
  selectedStation: TwinStationId | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  userInteractedRef: React.MutableRefObject<boolean>;
}) {
  const { camera } = useThree();
  const desiredCam = useMemo(() => new THREE.Vector3(0, 1.4, 6.2), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useEffect(() => {
    userInteractedRef.current = false;
    const station = TWIN_STATIONS.find((s) => s.id === selectedStation) ?? TWIN_STATIONS[0];
    if (!selectedStation || selectedStation === 'hub') {
      desiredCam.set(0, 1.4, 6.2);
      desiredTarget.set(0, 0, 0);
    } else {
      desiredCam.set(...station.cameraOffset);
      desiredTarget.set(...station.position);
    }
  }, [selectedStation, desiredCam, desiredTarget, userInteractedRef]);

  useFrame((_, delta) => {
    if (userInteractedRef.current) return;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCam.x, 4, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCam.y, 4, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCam.z, 4, delta);

    if (controlsRef.current) {
      controlsRef.current.target.x = THREE.MathUtils.damp(controlsRef.current.target.x, desiredTarget.x, 4, delta);
      controlsRef.current.target.y = THREE.MathUtils.damp(controlsRef.current.target.y, desiredTarget.y, 4, delta);
      controlsRef.current.target.z = THREE.MathUtils.damp(controlsRef.current.target.z, desiredTarget.z, 4, delta);
      controlsRef.current.update();
    }
  });

  return null;
}

function ConnectedCampusScene({
  reducedMotion,
  selectedStation,
  hoveredStation,
  onHover,
  onSelect,
}: {
  reducedMotion: boolean;
  selectedStation: TwinStationId | null;
  hoveredStation: TwinStationId | null;
  onHover: (id: TwinStationId | null) => void;
  onSelect: (id: TwinStationId) => void;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const hubCoreRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (hubCoreRef.current) {
      hubCoreRef.current.rotation.y += delta * 0.45;
    }
    if (rootRef.current && !selectedStation && !hoveredStation) {
      rootRef.current.rotation.y += delta * 0.08;
    }
  });

  const gpuMeta = TWIN_STATIONS[1];
  const roboMeta = TWIN_STATIONS[2];
  const printMeta = TWIN_STATIONS[3];
  const scopeMeta = TWIN_STATIONS[4];
  const hubMeta = TWIN_STATIONS[0];

  return (
    <group ref={rootRef}>
      {/* Blueprint campus ground plane */}
      <gridHelper args={[14, 28, '#1E3A5F', '#0F1B30']} position={[0, -1.12, 0]} />

      {/* Central Campus Hub */}
      <InteractiveStation
        meta={hubMeta}
        active={selectedStation === 'hub'}
        hovered={hoveredStation === 'hub'}
        onHover={onHover}
        onSelect={onSelect}
        labelY={0.95}
      >
        <mesh ref={hubCoreRef}>
          <octahedronGeometry args={[0.52, 1]} />
          <meshStandardMaterial color="#3B82F6" emissive="#22D3EE" emissiveIntensity={0.65} wireframe />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.24, 18, 18]} />
          <meshStandardMaterial color="#22D3EE" emissive="#22D3EE" emissiveIntensity={1.0} />
        </mesh>
      </InteractiveStation>

      <InteractiveStation
        meta={gpuMeta}
        active={selectedStation === 'gpu'}
        hovered={hoveredStation === 'gpu'}
        onHover={onHover}
        onSelect={onSelect}
        labelY={1.02}
      >
        <GPUWorkstationMesh />
      </InteractiveStation>

      <InteractiveStation
        meta={roboMeta}
        active={selectedStation === 'robotics'}
        hovered={hoveredStation === 'robotics'}
        onHover={onHover}
        onSelect={onSelect}
        labelY={1.12}
      >
        <RoboticArmMesh />
      </InteractiveStation>

      <InteractiveStation
        meta={printMeta}
        active={selectedStation === 'printer'}
        hovered={hoveredStation === 'printer'}
        onHover={onHover}
        onSelect={onSelect}
        labelY={0.98}
      >
        <PrinterFrameMesh />
      </InteractiveStation>

      <InteractiveStation
        meta={scopeMeta}
        active={selectedStation === 'oscilloscope'}
        hovered={hoveredStation === 'oscilloscope'}
        onHover={onHover}
        onSelect={onSelect}
        labelY={0.85}
      >
        <OscilloscopeMesh />
      </InteractiveStation>

      {TWIN_STATIONS.slice(1).map((station) => {
        const isHighlighted = selectedStation === station.id || hoveredStation === station.id;
        return (
          <Line
            key={station.id}
            points={[[0, 0, 0], station.position]}
            color={station.accent}
            lineWidth={isHighlighted ? 2.4 : 1.3}
            transparent
            opacity={isHighlighted ? 0.92 : 0.42}
          />
        );
      })}
    </group>
  );
}

export const CampusHeroScene: React.FC<{
  selectedStation?: TwinStationId | null;
  onSelectStation?: (id: TwinStationId | null) => void;
}> = ({ selectedStation: controlledSelected, onSelectStation }) => {
  const profile = useMemo(() => detectWebGLProfile(), []);
  const { ref, visible } = useVisibilityPause();
  const [internalSelected, setInternalSelected] = useState<TwinStationId | null>(null);
  const [hoveredStation, setHoveredStation] = useState<TwinStationId | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const userInteractedRef = useRef(false);

  const selectedStation = controlledSelected !== undefined ? controlledSelected : internalSelected;
  const handleSelect = (id: TwinStationId | null) => {
    if (onSelectStation) onSelectStation(id);
    else setInternalSelected(id);
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  if (!profile.supported) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-[#0D1424] via-[#111B2E] to-[#17243A] p-8 text-center">
        <div>
          <p className="font-display text-lg font-semibold text-[#F8FAFC]">Connected Campus Lab Topology</p>
          <p className="mt-1 text-xs text-[#94A3B8]">5 Departments · 6 Shared Labs · 28 Hardware Assets</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative h-full w-full min-h-[340px]">
      <Canvas
        dpr={profile.isSoftware ? 1 : [1, 1.5]}
        gl={{ antialias: !profile.isSoftware, powerPreference: 'high-performance' }}
        camera={{ position: [0, 1.4, 6.2], fov: 44 }}
        frameloop={visible && !profile.reducedMotion && !profile.isSoftware ? 'always' : 'demand'}
        onPointerMissed={() => handleSelect(null)}
      >
        <color attach="background" args={['#080D19']} />
        <fog attach="fog" args={['#080D19', 7, 16]} />
        {/* Studio 3-point + hemisphere rig */}
        <hemisphereLight args={['#38BDF8', '#080D19', 0.65]} />
        <directionalLight position={[5, 7, 5]} intensity={1.35} color="#F8FAFC" />
        <pointLight position={[-4.5, 2.5, -2.5]} intensity={1.1} color="#22D3EE" />
        <pointLight position={[3.5, -1.5, 3]} intensity={0.75} color="#8B5CF6" />

        <ConnectedCampusScene
          reducedMotion={profile.reducedMotion}
          selectedStation={selectedStation}
          hoveredStation={hoveredStation}
          onHover={setHoveredStation}
          onSelect={(id) => handleSelect(selectedStation === id ? null : id)}
        />

        <CameraRig
          selectedStation={selectedStation}
          controlsRef={controlsRef}
          userInteractedRef={userInteractedRef}
        />

        <OrbitControls
          ref={controlsRef}
          enableZoom={false}
          enablePan={false}
          maxPolarAngle={Math.PI / 1.75}
          minPolarAngle={Math.PI / 3.5}
          onStart={() => {
            userInteractedRef.current = true;
          }}
        />
      </Canvas>
    </div>
  );
};

export default CampusHeroScene;

