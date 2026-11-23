import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createOscilloscopeScreenTexture } from './sharedMaterials';

export interface ProceduralModelProps {
  accent?: string;
  animate?: boolean;
}

/** Grounded at y = 0 (bottom-center pivot) */
export const GpuWorkstation: React.FC<ProceduralModelProps> = ({
  accent = '#3B82F6',
  animate = true,
}) => {
  const fan1 = useRef<THREE.Mesh>(null);
  const fan2 = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!animate) return;
    if (fan1.current) fan1.current.rotation.z += delta * 2.6;
    if (fan2.current) fan2.current.rotation.z += delta * 2.6;
  });

  return (
    <group>
      {/* Chassis feet */}
      {[
        [-0.36, 0.03, -0.22],
        [0.36, 0.03, -0.22],
        [-0.36, 0.03, 0.22],
        [0.36, 0.03, 0.22],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <cylinderGeometry args={[0.045, 0.05, 0.06, 12]} />
          <meshStandardMaterial color="#090D16" roughness={0.85} metalness={0.2} />
        </mesh>
      ))}
      {/* Main brushed aluminum tower */}
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.88, 1.12, 0.56]} />
        <meshStandardMaterial color="#18263E" metalness={0.72} roughness={0.28} />
      </mesh>
      {/* Tempered glass front bezel */}
      <mesh position={[0, 0.62, 0.285]}>
        <boxGeometry args={[0.78, 1.0, 0.03]} />
        <meshStandardMaterial color="#0A1220" metalness={0.2} roughness={0.12} />
      </mesh>
      {/* Side intake grille */}
      <mesh position={[-0.445, 0.62, 0]}>
        <boxGeometry args={[0.02, 0.88, 0.42]} />
        <meshStandardMaterial color="#0F172A" metalness={0.6} roughness={0.45} />
      </mesh>
      {/* Status light bar */}
      <mesh position={[-0.31, 0.62, 0.305]}>
        <boxGeometry args={[0.035, 0.9, 0.015]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} />
      </mesh>
      {/* Dual cooling blower rings */}
      <mesh ref={fan1} position={[0.06, 0.8, 0.305]}>
        <torusGeometry args={[0.17, 0.028, 10, 20]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.85} />
      </mesh>
      <mesh ref={fan2} position={[0.06, 0.42, 0.305]}>
        <torusGeometry args={[0.15, 0.026, 10, 18]} />
        <meshStandardMaterial color="#22D3EE" emissive="#22D3EE" emissiveIntensity={0.75} />
      </mesh>
    </group>
  );
};

export const ServerRack: React.FC<ProceduralModelProps> = ({ accent = '#6366F1' }) => (
  <group>
    <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.92, 1.44, 0.78]} />
      <meshStandardMaterial color="#0F172A" metalness={0.65} roughness={0.35} />
    </mesh>
    {[0.24, 0.48, 0.72, 0.96, 1.2].map((y, idx) => (
      <group key={idx} position={[0, y, 0.395]}>
        <mesh>
          <boxGeometry args={[0.8, 0.17, 0.03]} />
          <meshStandardMaterial color="#1E293B" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh position={[-0.3, 0, 0.02]}>
          <boxGeometry args={[0.08, 0.03, 0.01]} />
          <meshStandardMaterial
            color={idx % 2 === 0 ? accent : '#22D3EE'}
            emissive={idx % 2 === 0 ? accent : '#22D3EE'}
            emissiveIntensity={1}
          />
        </mesh>
      </group>
    ))}
  </group>
);

export const RoboticArm: React.FC<ProceduralModelProps> = ({
  accent = '#8B5CF6',
  animate = true,
}) => {
  const turretRef = useRef<THREE.Group>(null);
  const elbowRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    if (turretRef.current) turretRef.current.rotation.y = Math.sin(t * 0.55) * 0.55;
    if (elbowRef.current) elbowRef.current.rotation.z = -0.65 + Math.sin(t * 0.9) * 0.16;
  });

  return (
    <group>
      {/* Optical table pedestal */}
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.48, 0.18, 24]} />
        <meshStandardMaterial color="#1E293B" metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.32, 0.34, 0.04, 20]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.45} />
      </mesh>
      <group ref={turretRef} position={[0, 0.22, 0]}>
        <mesh position={[0, 0.34, 0]} castShadow>
          <boxGeometry args={[0.18, 0.68, 0.18]} />
          <meshStandardMaterial color="#3B82F6" metalness={0.5} roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.68, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.26, 18]} />
          <meshStandardMaterial color="#22D3EE" emissive="#22D3EE" emissiveIntensity={0.5} />
        </mesh>
        <group ref={elbowRef} position={[0, 0.68, 0]} rotation={[0, 0, -0.65]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.13, 0.62, 0.13]} />
            <meshStandardMaterial color="#CBD5E1" metalness={0.75} roughness={0.24} />
          </mesh>
          {/* Parallel gripper */}
          <mesh position={[0, 0.64, 0]}>
            <boxGeometry args={[0.18, 0.08, 0.14]} />
            <meshStandardMaterial color="#0F172A" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[-0.06, 0.72, 0]}>
            <boxGeometry args={[0.03, 0.1, 0.06]} />
            <meshStandardMaterial color="#22D3EE" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0.06, 0.72, 0]}>
            <boxGeometry args={[0.03, 0.1, 0.06]} />
            <meshStandardMaterial color="#22D3EE" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

export const MobileRobot: React.FC<ProceduralModelProps> = ({
  accent = '#8B5CF6',
  animate = true,
}) => {
  const turret = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (animate && turret.current) turret.current.rotation.y += delta * 2.4;
  });
  return (
    <group>
      {/* Rover deck */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.88, 0.18, 0.66]} />
        <meshStandardMaterial color="#1E293B" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <boxGeometry args={[0.74, 0.04, 0.54]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} />
      </mesh>
      {/* 4 Wheels */}
      {[
        [-0.32, 0.14, -0.36],
        [0.32, 0.14, -0.36],
        [-0.32, 0.14, 0.36],
        [0.32, 0.14, 0.36],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.09, 16]} />
          <meshStandardMaterial color="#090D16" roughness={0.88} metalness={0.15} />
        </mesh>
      ))}
      {/* Mast & LiDAR puck */}
      <mesh position={[0.12, 0.52, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.36, 12]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.8} roughness={0.22} />
      </mesh>
      <mesh ref={turret} position={[0.12, 0.72, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.1, 18]} />
        <meshStandardMaterial color="#22D3EE" emissive="#22D3EE" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
};

export const Lidar: React.FC<ProceduralModelProps> = ({
  accent = '#22D3EE',
  animate = true,
}) => {
  const rotor = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (animate && rotor.current) rotor.current.rotation.y += delta * 3.5;
  });
  return (
    <group>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.44, 0.24, 24]} />
        <meshStandardMaterial color="#1E293B" metalness={0.7} roughness={0.28} />
      </mesh>
      <mesh ref={rotor} position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.24, 24]} />
        <meshStandardMaterial color="#0B1220" metalness={0.35} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <torusGeometry args={[0.33, 0.02, 8, 24]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.33, 0.33, 0.08, 24]} />
        <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.25} />
      </mesh>
    </group>
  );
};

export const ThreeDPrinter: React.FC<ProceduralModelProps> = ({
  accent = '#10B981',
  animate = true,
}) => {
  const headRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animate || !headRef.current) return;
    headRef.current.position.x = Math.sin(clock.getElapsedTime() * 1.4) * 0.24;
  });

  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.06, 0]} castShadow>
        <boxGeometry args={[1.0, 0.12, 1.0]} />
        <meshStandardMaterial color="#0F172A" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* 4 Frame posts */}
      {[
        [-0.44, 0.58, -0.44],
        [0.44, 0.58, -0.44],
        [-0.44, 0.58, 0.44],
        [0.44, 0.58, 0.44],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[0.07, 1.0, 0.07]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.28} />
        </mesh>
      ))}
      {/* Top canopy */}
      <mesh position={[0, 1.08, 0]}>
        <boxGeometry args={[0.98, 0.08, 0.98]} />
        <meshStandardMaterial color="#1E293B" metalness={0.55} roughness={0.32} />
      </mesh>
      {/* Build plate */}
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[0.72, 0.05, 0.72]} />
        <meshStandardMaterial color="#17243A" metalness={0.6} roughness={0.22} />
      </mesh>
      {/* Extruder carriage */}
      <mesh ref={headRef} position={[0, 0.68, 0]}>
        <boxGeometry args={[0.2, 0.18, 0.2]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.65} />
      </mesh>
    </group>
  );
};

export const Oscilloscope: React.FC<ProceduralModelProps> = ({ accent = '#22D3EE' }) => {
  const screenTex = useMemo(() => createOscilloscopeScreenTexture(accent), [accent]);
  useEffect(() => {
    return () => {
      screenTex?.dispose();
    };
  }, [screenTex]);

  return (
    <group>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[1.15, 0.72, 0.5]} />
        <meshStandardMaterial color="#1E293B" metalness={0.45} roughness={0.38} />
      </mesh>
      <mesh position={[-0.16, 0.44, 0.256]}>
        <planeGeometry args={[0.64, 0.44]} />
        <meshStandardMaterial
          map={screenTex ?? undefined}
          emissive="#0EA5E9"
          emissiveIntensity={0.35}
          color="#FFFFFF"
        />
      </mesh>
      {[0.58, 0.42, 0.26].map((y, idx) => (
        <mesh key={idx} position={[0.36, y, 0.27]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.05, 16]} />
          <meshStandardMaterial
            color={idx === 0 ? accent : '#94A3B8'}
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  );
};

export const CircuitBoard: React.FC<ProceduralModelProps> = ({ accent = '#22D3EE' }) => (
  <group rotation={[0.18, 0.22, 0]}>
    <mesh position={[0, 0.12, 0]} castShadow>
      <boxGeometry args={[1.15, 0.06, 0.8]} />
      <meshStandardMaterial color="#065F46" metalness={0.3} roughness={0.5} />
    </mesh>
    <mesh position={[0, 0.18, 0]}>
      <boxGeometry args={[0.36, 0.06, 0.36]} />
      <meshStandardMaterial color="#0F172A" metalness={0.75} roughness={0.25} />
    </mesh>
    <mesh position={[-0.4, 0.19, -0.2]}>
      <boxGeometry args={[0.2, 0.08, 0.24]} />
      <meshStandardMaterial color="#CBD5E1" metalness={0.85} roughness={0.2} />
    </mesh>
    <mesh position={[0.38, 0.17, 0.2]}>
      <boxGeometry args={[0.24, 0.04, 0.14]} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.85} />
    </mesh>
  </group>
);

export const FpgaBoard: React.FC<ProceduralModelProps> = ({ accent = '#3B82F6' }) => (
  <group rotation={[0.16, -0.2, 0]}>
    <mesh position={[0, 0.12, 0]} castShadow>
      <boxGeometry args={[1.25, 0.07, 0.86]} />
      <meshStandardMaterial color="#1E3A8A" metalness={0.35} roughness={0.45} />
    </mesh>
    {/* Heatsink fin block */}
    <mesh position={[0, 0.22, 0]}>
      <boxGeometry args={[0.46, 0.14, 0.46]} />
      <meshStandardMaterial color="#94A3B8" metalness={0.85} roughness={0.22} />
    </mesh>
    <mesh position={[0.45, 0.18, -0.25]}>
      <boxGeometry args={[0.16, 0.08, 0.28]} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.75} />
    </mesh>
  </group>
);

export const DevBoard: React.FC<ProceduralModelProps> = ({ accent = '#22D3EE' }) => (
  <CircuitBoard accent={accent} />
);

export const JetsonModule: React.FC<ProceduralModelProps> = ({ accent = '#22D3EE' }) => (
  <group>
    <mesh position={[0, 0.18, 0]} castShadow>
      <boxGeometry args={[0.85, 0.24, 0.85]} />
      <meshStandardMaterial color="#111827" metalness={0.7} roughness={0.28} />
    </mesh>
    <mesh position={[0, 0.32, 0]}>
      <boxGeometry args={[0.68, 0.04, 0.68]} />
      <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
    </mesh>
    <mesh position={[0, 0.35, 0]}>
      <torusGeometry args={[0.2, 0.025, 8, 20]} />
      <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} />
    </mesh>
  </group>
);

export const NetworkSwitch: React.FC<ProceduralModelProps> = ({ accent = '#3B82F6' }) => (
  <group>
    <mesh position={[0, 0.22, 0]} castShadow>
      <boxGeometry args={[1.25, 0.26, 0.72]} />
      <meshStandardMaterial color="#17243A" metalness={0.68} roughness={0.3} />
    </mesh>
    {[-0.45, -0.27, -0.09, 0.09, 0.27, 0.45].map((x, i) => (
      <mesh key={i} position={[x, 0.22, 0.37]}>
        <boxGeometry args={[0.11, 0.09, 0.02]} />
        <meshStandardMaterial
          color={i % 2 === 0 ? accent : '#22D3EE'}
          emissive={i % 2 === 0 ? accent : '#22D3EE'}
          emissiveIntensity={0.8}
        />
      </mesh>
    ))}
  </group>
);

export const CncMachine: React.FC<ProceduralModelProps> = ({
  accent = '#F97316',
  animate = true,
}) => {
  const spindle = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (animate && spindle.current) {
      spindle.current.position.x = Math.sin(clock.getElapsedTime() * 1.1) * 0.2;
    }
  });
  return (
    <group>
      <mesh position={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[1.1, 0.28, 0.92]} />
        <meshStandardMaterial color="#1E293B" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.6, -0.32]}>
        <boxGeometry args={[1.05, 0.72, 0.18]} />
        <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0.88, 0.02]}>
        <boxGeometry args={[1.05, 0.14, 0.7]} />
        <meshStandardMaterial color="#0F172A" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={spindle} position={[0, 0.56, 0.05]}>
        <cylinderGeometry args={[0.09, 0.05, 0.38, 16]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
};

export const CadWorkstation: React.FC<ProceduralModelProps> = ({ accent = '#3B82F6' }) => (
  <group>
    <mesh position={[0, 0.06, 0]}>
      <boxGeometry args={[0.85, 0.08, 0.55]} />
      <meshStandardMaterial color="#1E293B" metalness={0.6} roughness={0.35} />
    </mesh>
    <mesh position={[0, 0.34, -0.08]}>
      <boxGeometry args={[0.1, 0.5, 0.1]} />
      <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.28} />
    </mesh>
    <mesh position={[0, 0.62, 0]}>
      <boxGeometry args={[1.25, 0.68, 0.06]} />
      <meshStandardMaterial color="#0A1220" metalness={0.35} roughness={0.2} />
    </mesh>
    <mesh position={[0, 0.62, 0.036]}>
      <planeGeometry args={[1.15, 0.58]} />
      <meshStandardMaterial color="#0C2142" emissive={accent} emissiveIntensity={0.45} />
    </mesh>
  </group>
);

export const GenericInstrument: React.FC<ProceduralModelProps> = ({ accent = '#10B981' }) => (
  <Oscilloscope accent={accent} />
);
