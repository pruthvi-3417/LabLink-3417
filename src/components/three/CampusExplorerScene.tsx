import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { DEPARTMENT_THEME_LIST, getDepartmentTheme, type DepartmentTheme } from '../../config/departmentThemes';
import type { Equipment, Laboratory } from '../../types/models';
import { EquipmentModelBySpec } from '../../three/models/categoryToModel';
import { StudioEnvironment, createBuildingWindowTexture } from '../../three/models/sharedMaterials';
import { createNodeLabelTexture, detectWebGLProfile, useVisibilityPause } from './webglUtils';

export type ExplorerLevel = 'campus' | 'department' | 'lab';
export type EquipmentAvailabilityState = 'available' | 'in_use' | 'maintenance';

export interface CampusCrossLink {
  fromDeptId: string;
  toDeptId: string;
  count: number;
}

export interface ExplorerEquipmentNode {
  equipment: Equipment;
  state: EquipmentAvailabilityState;
  position: [number, number, number];
}

function getStatusColor(state: EquipmentAvailabilityState): string {
  if (state === 'maintenance') return '#EF4444';
  if (state === 'in_use') return '#F59E0B';
  return '#10B981';
}

function DepartmentBuildingMesh({
  theme,
  selected,
  hovered,
  statsLabel,
  onHover,
  onSelect,
}: {
  theme: DepartmentTheme;
  selected: boolean;
  hovered: boolean;
  statsLabel: string;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const windowTex = useMemo(() => createBuildingWindowTexture(theme.accent2), [theme.accent2]);
  const labelTex = useMemo(
    () => createNodeLabelTexture(`${theme.code} · ${theme.building}`, statsLabel, theme.accent, selected || hovered),
    [theme.code, theme.building, statsLabel, theme.accent, selected, hovered]
  );

  useEffect(() => {
    return () => {
      windowTex?.dispose();
      labelTex?.dispose();
    };
  }, [windowTex, labelTex]);

  const h = theme.buildingHeight;
  const active = selected || hovered;

  return (
    <group
      position={theme.campusPosition}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(theme.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(theme.id);
      }}
    >
      {/* Plinth */}
      <mesh position={[0, 0.14, 0]} receiveShadow>
        <boxGeometry args={[2.8, 0.28, 2.4]} />
        <meshStandardMaterial color="#0F172A" metalness={0.4} roughness={0.65} />
      </mesh>
      {/* Primary architectural mass */}
      <mesh position={[0, 0.28 + h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.3, h, 1.9]} />
        <meshStandardMaterial
          map={windowTex ?? undefined}
          color="#FFFFFF"
          metalness={0.35}
          roughness={0.45}
        />
      </mesh>
      {/* Glass atrium wing */}
      <mesh position={[0.75, 0.28 + h * 0.35, 0.45]}>
        <boxGeometry args={[1.05, h * 0.7, 1.15]} />
        <meshStandardMaterial
          color="#0D213B"
          metalness={0.65}
          roughness={0.18}
          emissive={theme.accent}
          emissiveIntensity={active ? 0.32 : 0.12}
        />
      </mesh>
      {/* Rooftop mechanical penthouse & accent beacon trim */}
      <mesh position={[-0.3, 0.28 + h + 0.16, -0.2]}>
        <boxGeometry args={[1.25, 0.32, 0.95]} />
        <meshStandardMaterial color="#17243A" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.28 + h + 0.03, 0]}>
        <boxGeometry args={[2.36, 0.06, 1.96]} />
        <meshStandardMaterial
          color={theme.accent}
          emissive={theme.accent}
          emissiveIntensity={active ? 1.15 : 0.65}
        />
      </mesh>
      {/* Selection ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[1.7, active ? 1.95 : 1.82, 32]} />
        <meshBasicMaterial
          color={theme.accent}
          transparent
          opacity={active ? 0.85 : 0.28}
          side={THREE.DoubleSide}
        />
      </mesh>

      {labelTex && (
        <sprite position={[0, h + 1.15, 0]} scale={active ? [2.8, 0.82, 1] : [2.45, 0.72, 1]}>
          <spriteMaterial map={labelTex} transparent depthWrite={false} />
        </sprite>
      )}
    </group>
  );
}

function InstancedCampusTrees() {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);

  const treePositions = useMemo(() => {
    const pts: Array<[number, number, number, number]> = [];
    const ringCount = 28;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      const r = 9.2 + (i % 3) * 0.95;
      const scale = 0.85 + ((i * 37) % 30) / 100;
      pts.push([Math.cos(a) * r, 0, Math.sin(a) * r, scale]);
    }
    // Inner quad trees
    [
      [-2.3, 0, 0.4, 0.95],
      [2.4, 0, -0.3, 1.0],
      [0.2, 0, 2.2, 0.9],
      [-7.6, 0, 1.1, 1.05],
      [7.6, 0, 1.0, 0.95],
    ].forEach((p) => pts.push(p as [number, number, number, number]));
    return pts;
  }, []);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    const canopyColor = new THREE.Color();
    treePositions.forEach(([x, y, z, s], idx) => {
      if (trunkRef.current) {
        dummy.position.set(x, y + 0.3 * s, z);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        trunkRef.current.setMatrixAt(idx, dummy.matrix);
      }
      if (canopyRef.current) {
        dummy.position.set(x, y + 0.88 * s, z);
        dummy.scale.set(s, s * 1.15, s);
        dummy.updateMatrix();
        canopyRef.current.setMatrixAt(idx, dummy.matrix);
        canopyColor.set(idx % 2 === 0 ? '#113B38' : '#164E4A');
        canopyRef.current.setColorAt(idx, canopyColor);
      }
    });
    if (trunkRef.current) {
      trunkRef.current.instanceMatrix.needsUpdate = true;
      trunkRef.current.computeBoundingSphere();
    }
    if (canopyRef.current) {
      canopyRef.current.instanceMatrix.needsUpdate = true;
      if (canopyRef.current.instanceColor) canopyRef.current.instanceColor.needsUpdate = true;
      canopyRef.current.computeBoundingSphere();
    }
  }, [treePositions]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, treePositions.length]}>
        <cylinderGeometry args={[0.07, 0.1, 0.6, 8]} />
        <meshStandardMaterial color="#3B2F2F" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, treePositions.length]}>
        <coneGeometry args={[0.42, 0.95, 10]} />
        <meshStandardMaterial color="#113B38" roughness={0.8} metalness={0.05} />
      </instancedMesh>
    </group>
  );
}

function AutonomousShuttles({ animate }: { animate: boolean }) {
  const shuttleRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const count = 3;

  useEffect(() => {
    if (!shuttleRef.current) return;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      dummy.position.set(Math.cos(t) * 6.8, 0.14, Math.sin(t) * 5.4);
      dummy.rotation.set(0, -t, 0);
      dummy.updateMatrix();
      shuttleRef.current.setMatrixAt(i, dummy.matrix);
    }
    shuttleRef.current.instanceMatrix.needsUpdate = true;
    shuttleRef.current.computeBoundingSphere();
  }, [dummy]);

  useFrame(({ clock }) => {
    if (!animate || !shuttleRef.current) return;
    const base = clock.getElapsedTime() * 0.22;
    for (let i = 0; i < count; i++) {
      const t = base + (i / count) * Math.PI * 2;
      const x = Math.cos(t) * 6.8;
      const z = Math.sin(t) * 5.4;
      dummy.position.set(x, 0.14, z);
      dummy.rotation.set(0, -t, 0);
      dummy.updateMatrix();
      shuttleRef.current.setMatrixAt(i, dummy.matrix);
    }
    shuttleRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={shuttleRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[0.28, 0.2, 0.56]} />
      <meshStandardMaterial color="#22D3EE" emissive="#22D3EE" emissiveIntensity={0.45} metalness={0.5} roughness={0.3} />
    </instancedMesh>
  );
}

function AmbientParticles({ animate }: { animate: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(200 * 3);
    for (let i = 0; i < 200; i++) {
      const a = (i * 137.5 * Math.PI) / 180;
      const r = 1.5 + ((i * 19) % 100) / 9;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = 0.6 + ((i * 29) % 40) / 8;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (animate && pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.03;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.07} color="#60A5FA" transparent opacity={0.45} sizeAttenuation />
    </points>
  );
}

function LabInteriorCutaway({
  departmentTheme,
  lab,
  items,
  selectedEquipmentId,
  hoveredEquipmentId,
  onHoverEquipment,
  onSelectEquipment,
  animate,
}: {
  departmentTheme: DepartmentTheme;
  lab: Laboratory | null;
  items: ExplorerEquipmentNode[];
  selectedEquipmentId: string | null;
  hoveredEquipmentId: string | null;
  onHoverEquipment: (id: string | null) => void;
  onSelectEquipment: (id: string) => void;
  animate: boolean;
}) {
  return (
    <group position={[0, 0, 0]}>
      {/* 12m x 8m Cutaway Laboratory Floor */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[12, 0.1, 8]} />
        <meshStandardMaterial color="#0C1424" metalness={0.25} roughness={0.75} />
      </mesh>
      <gridHelper args={[12, 12, departmentTheme.accent, '#162238']} position={[0, 0.01, 0]} />

      {/* Back & Left cutaway structural walls */}
      <mesh position={[0, 1.5, -4.05]}>
        <boxGeometry args={[12.1, 3.0, 0.14]} />
        <meshStandardMaterial color="#111B2E" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[-6.05, 1.5, 0]}>
        <boxGeometry args={[0.14, 3.0, 8.1]} />
        <meshStandardMaterial color="#0E1728" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Wall top accent LED rail */}
      <mesh position={[0, 2.85, -3.96]}>
        <boxGeometry args={[11.6, 0.06, 0.04]} />
        <meshStandardMaterial
          color={departmentTheme.accent}
          emissive={departmentTheme.accent}
          emissiveIntensity={0.85}
        />
      </mesh>

      {/* Equipment bays inside room */}
      {items.map((node) => {
        const eq = node.equipment;
        const statusColor = getStatusColor(node.state);
        const active = selectedEquipmentId === eq.id || hoveredEquipmentId === eq.id;
        return (
          <EquipmentBayNode
            key={eq.id}
            node={node}
            statusColor={statusColor}
            deptAccent={departmentTheme.accent}
            active={active}
            animate={animate}
            onHover={() => onHoverEquipment(eq.id)}
            onUnhover={() => onHoverEquipment(null)}
            onSelect={() => onSelectEquipment(eq.id)}
          />
        );
      })}

      {/* Ambient lab name floor strip if empty */}
      {items.length === 0 && lab && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[2.2, 0.25, 1.2]} />
          <meshStandardMaterial color="#17243A" />
        </mesh>
      )}
    </group>
  );
}

function EquipmentBayNode({
  node,
  statusColor,
  deptAccent,
  active,
  animate,
  onHover,
  onUnhover,
  onSelect,
}: {
  node: ExplorerEquipmentNode;
  statusColor: string;
  deptAccent: string;
  active: boolean;
  animate: boolean;
  onHover: () => void;
  onUnhover: () => void;
  onSelect: () => void;
}) {
  const labelTex = useMemo(
    () =>
      createNodeLabelTexture(
        node.equipment.equipmentId,
        node.equipment.name,
        statusColor,
        active
      ),
    [node.equipment.equipmentId, node.equipment.name, statusColor, active]
  );

  useEffect(() => {
    return () => {
      labelTex?.dispose();
    };
  }, [labelTex]);

  return (
    <group
      position={node.position}
      scale={active ? 1.07 : 1}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onUnhover();
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Floor workbench pad */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[1.65, 0.08, 1.45]} />
        <meshStandardMaterial color="#17243A" metalness={0.45} roughness={0.45} />
      </mesh>
      {/* Semantic status ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
        <ringGeometry args={[0.68, active ? 0.8 : 0.76, 32]} />
        <meshBasicMaterial color={statusColor} transparent opacity={active ? 0.95 : 0.65} side={THREE.DoubleSide} />
      </mesh>
      {/* Equipment 3D procedural model resting on bench */}
      <group position={[0, 0.09, 0]} scale={0.78}>
        <EquipmentModelBySpec
          equipment={node.equipment}
          category={node.equipment.category}
          accent={deptAccent}
          animate={animate}
        />
      </group>
      {/* Status beacon pole */}
      <mesh position={[0.68, 0.55, -0.56]}>
        <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.68, 1.04, -0.56]}>
        <sphereGeometry args={[0.065, 12, 12]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1.1} />
      </mesh>
      {labelTex && (
        <sprite position={[0, 1.78, 0]} scale={active ? [2.15, 0.62, 1] : [1.85, 0.54, 1]}>
          <spriteMaterial map={labelTex} transparent depthWrite={false} />
        </sprite>
      )}
    </group>
  );
}

function ExplorerCameraRig({
  level,
  selectedDeptId,
  selectedEquipmentNode,
  controlsRef,
  userInteractedRef,
}: {
  level: ExplorerLevel;
  selectedDeptId: string | null;
  selectedEquipmentNode: ExplorerEquipmentNode | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  userInteractedRef: React.MutableRefObject<boolean>;
}) {
  const { camera } = useThree();
  const desiredPos = useMemo(() => new THREE.Vector3(0, 9.5, 15.5), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(0, 0.8, 0), []);

  useEffect(() => {
    userInteractedRef.current = false;
    if (level === 'lab') {
      if (selectedEquipmentNode) {
        const [ex, , ez] = selectedEquipmentNode.position;
        desiredPos.set(ex + 2.4, 3.2, ez + 3.6);
        desiredTarget.set(ex, 0.8, ez);
      } else {
        desiredPos.set(0, 6.2, 8.8);
        desiredTarget.set(0, 0.6, 0);
      }
      return;
    }

    if (level === 'department' && selectedDeptId) {
      const t = getDepartmentTheme(selectedDeptId);
      const [bx, , bz] = t.campusPosition;
      desiredPos.set(bx + 3.8, t.buildingHeight + 3.4, bz + 6.4);
      desiredTarget.set(bx, t.buildingHeight * 0.45, bz);
      return;
    }

    desiredPos.set(0, 9.5, 15.5);
    desiredTarget.set(0, 0.8, 0);
  }, [level, selectedDeptId, selectedEquipmentNode, desiredPos, desiredTarget, userInteractedRef]);

  useFrame((_, delta) => {
    if (userInteractedRef.current) return;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredPos.x, 4.5, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredPos.y, 4.5, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredPos.z, 4.5, delta);

    if (controlsRef.current) {
      controlsRef.current.target.x = THREE.MathUtils.damp(controlsRef.current.target.x, desiredTarget.x, 4.5, delta);
      controlsRef.current.target.y = THREE.MathUtils.damp(controlsRef.current.target.y, desiredTarget.y, 4.5, delta);
      controlsRef.current.target.z = THREE.MathUtils.damp(controlsRef.current.target.z, desiredTarget.z, 4.5, delta);
      controlsRef.current.update();
    }
  });

  return null;
}

export const CampusExplorerScene: React.FC<{
  level: ExplorerLevel;
  selectedDeptId: string | null;
  hoveredDeptId: string | null;
  onHoverDept: (id: string | null) => void;
  onSelectDept: (id: string) => void;
  selectedLab: Laboratory | null;
  labEquipmentNodes: ExplorerEquipmentNode[];
  selectedEquipmentId: string | null;
  hoveredEquipmentId: string | null;
  onHoverEquipment: (id: string | null) => void;
  onSelectEquipment: (id: string) => void;
  deptStatsMap: Record<string, string>;
  crossLinks: CampusCrossLink[];
}> = ({
  level,
  selectedDeptId,
  hoveredDeptId,
  onHoverDept,
  onSelectDept,
  selectedLab,
  labEquipmentNodes,
  selectedEquipmentId,
  hoveredEquipmentId,
  onHoverEquipment,
  onSelectEquipment,
  deptStatsMap,
  crossLinks,
}) => {
  const profile = useMemo(() => detectWebGLProfile(), []);
  const { ref, visible } = useVisibilityPause();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const userInteractedRef = useRef(false);

  const activeDeptTheme = getDepartmentTheme(selectedDeptId);
  const selectedEquipNode = useMemo(
    () => labEquipmentNodes.find((n) => n.equipment.id === selectedEquipmentId) ?? null,
    [labEquipmentNodes, selectedEquipmentId]
  );

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  if (!profile.supported) {
    return null;
  }

  return (
    <div ref={ref} className="h-full w-full" data-testid="campus-explorer-canvas">
      <Canvas
        dpr={profile.isSoftware ? 1 : [1, 1.5]}
        gl={{ antialias: !profile.isSoftware, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ position: [0, 9.5, 15.5], fov: 44 }}
        frameloop={visible && !profile.reducedMotion && !profile.isSoftware ? 'always' : 'demand'}
        onPointerMissed={() => {
          if (level === 'department') onHoverDept(null);
        }}
      >
        <color attach="background" args={['#070B14']} />
        <fog attach="fog" args={['#070B14', 18, 42]} />
        <StudioEnvironment />

        <hemisphereLight args={['#38BDF8', '#070B14', 0.65]} />
        <directionalLight position={[10, 14, 9]} intensity={1.3} color="#FFF7ED" />
        <pointLight position={[-8, 6, -6]} intensity={0.95} color="#22D3EE" />

        {level !== 'lab' ? (
          <group>
            {/* Ground campus plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
              <circleGeometry args={[24, 48]} />
              <meshStandardMaterial color="#09101D" roughness={0.85} metalness={0.1} />
            </mesh>
            <gridHelper args={[28, 28, '#1E3A5F', '#0E192D']} position={[0, 0.0, 0]} />

            {/* Central courtyard circular walkway */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
              <ringGeometry args={[6.6, 7.0, 64]} />
              <meshStandardMaterial color="#17243A" roughness={0.7} />
            </mesh>

            {/* 5 Department Buildings */}
            {DEPARTMENT_THEME_LIST.map((theme) => (
              <DepartmentBuildingMesh
                key={theme.id}
                theme={theme}
                selected={selectedDeptId === theme.id}
                hovered={hoveredDeptId === theme.id}
                statsLabel={deptStatsMap[theme.id] ?? `${theme.code} Wing`}
                onHover={onHoverDept}
                onSelect={onSelectDept}
              />
            ))}

            {/* Cross-department real booking link arcs */}
            {crossLinks.map((lk, i) => {
              const from = getDepartmentTheme(lk.fromDeptId);
              const to = getDepartmentTheme(lk.toDeptId);
              const p1: [number, number, number] = [
                from.campusPosition[0],
                from.buildingHeight + 0.5,
                from.campusPosition[2],
              ];
              const p2: [number, number, number] = [
                to.campusPosition[0],
                to.buildingHeight + 0.5,
                to.campusPosition[2],
              ];
              const mid: [number, number, number] = [
                (p1[0] + p2[0]) / 2,
                Math.max(p1[1], p2[1]) + 1.8,
                (p1[2] + p2[2]) / 2,
              ];
              return (
                <Line
                  key={`${lk.fromDeptId}-${lk.toDeptId}-${i}`}
                  points={[p1, mid, p2]}
                  color="#22D3EE"
                  lineWidth={Math.min(3, 1.4 + lk.count * 0.4)}
                  transparent
                  opacity={0.55}
                />
              );
            })}

            <InstancedCampusTrees />
            <AutonomousShuttles animate={!profile.reducedMotion && !profile.isSoftware} />
            <AmbientParticles animate={!profile.reducedMotion && !profile.isSoftware} />
          </group>
        ) : (
          <LabInteriorCutaway
            departmentTheme={activeDeptTheme}
            lab={selectedLab}
            items={labEquipmentNodes}
            selectedEquipmentId={selectedEquipmentId}
            hoveredEquipmentId={hoveredEquipmentId}
            onHoverEquipment={onHoverEquipment}
            onSelectEquipment={onSelectEquipment}
            animate={!profile.reducedMotion && !profile.isSoftware}
          />
        )}

        <ExplorerCameraRig
          level={level}
          selectedDeptId={selectedDeptId}
          selectedEquipmentNode={selectedEquipNode}
          controlsRef={controlsRef}
          userInteractedRef={userInteractedRef}
        />

        <OrbitControls
          ref={controlsRef}
          enablePan
          minDistance={3.5}
          maxDistance={26}
          maxPolarAngle={Math.PI / 2.1}
          minPolarAngle={Math.PI / 8}
          onStart={() => {
            userInteractedRef.current = true;
          }}
        />
      </Canvas>
    </div>
  );
};

export default CampusExplorerScene;
