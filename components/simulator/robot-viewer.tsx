'use client';

import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import type { URDFRobot } from 'urdf-loader';
import type { SceneDefaults } from '@prompower/sim-core';
import type { RobotBounds } from './fit-robot';
import { FrameRateProbe } from './frame-rate-probe';

const SURFACE = '#14161a';
const TABLE_TOP = '#343941';
const GRID_CELL = '#2f343c';
const GRID_SECTION = '#454c57';
const CAMERA_FOV = 40;
const TABLE_LEG = '#1e2127';
const TABLE_THICKNESS = 0.04;
const LEG_THICKNESS = 0.05;
const LEG_INSET = 0.03;

interface RobotViewerProps {
  robot: URDFRobot;
  /** Имена суставов в том же порядке, что и `values`. */
  jointNames: readonly string[];
  /** Углы в радианах, уже зажатые в пределы. */
  values: readonly number[];
  scene: SceneDefaults;
  /** Габариты загруженной модели: от них считается кадр камеры. */
  bounds: RobotBounds;
  onFpsSample: (fps: number) => void;
  /** Содержимое сцены помимо робота и стола: детали, зоны, разметка задания. */
  children?: React.ReactNode;
}

export function RobotViewer({
  robot,
  jointNames,
  values,
  scene,
  bounds,
  onFpsSample,
  children,
}: RobotViewerProps) {
  useEffect(() => {
    jointNames.forEach((name, index) => {
      robot.setJointValue(name, values[index] ?? 0);
    });
  }, [robot, jointNames, values]);

  // Дистанция, на которой описывающая сфера модели ровно вписывается в кадр;
  // cameraZoom добавляет к ней запас по краям.
  const fitDistance = bounds.radius / Math.sin((CAMERA_FOV / 2) * (Math.PI / 180));
  const distance = fitDistance * scene.cameraZoom;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [distance * 0.62, distance * 0.5, distance * 0.62], fov: CAMERA_FOV }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[SURFACE]} />
      <fog attach="fog" args={[SURFACE, distance * 2, distance * 6]} />

      <hemisphereLight args={['#8a93a5', '#1a1d22', 0.7]} />
      <directionalLight
        position={[distance, distance * 1.4, distance * 0.6]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
      />

      <primitive object={robot} />

      {children}

      <WorkTable size={scene.tableSize} height={scene.tableHeight} />

      <Grid
        position={[0, -scene.tableHeight, 0]}
        cellSize={0.1}
        cellThickness={0.5}
        cellColor={GRID_CELL}
        sectionSize={1}
        sectionThickness={1}
        sectionColor={GRID_SECTION}
        fadeDistance={distance * 6}
        fadeStrength={1.2}
        infiniteGrid
      />

      <OrbitControls
        makeDefault
        target={[0, bounds.centerY, 0]}
        enableDamping
        minDistance={0.5}
        maxDistance={distance * 4}
        maxPolarAngle={Math.PI * 0.495}
      />

      <FrameRateProbe onSample={onFpsSample} />
    </Canvas>
  );
}

/** Столешница на четырёх ножках. Робот стоит на её поверхности, поверхность — на нуле по Y. */
function WorkTable({ size, height }: { size: readonly [number, number]; height: number }) {
  const [width, depth] = size;
  const inset = LEG_THICKNESS / 2 + LEG_INSET;
  const legY = -TABLE_THICKNESS - (height - TABLE_THICKNESS) / 2;
  const legHeight = height - TABLE_THICKNESS;

  return (
    <group>
      <mesh position={[0, -TABLE_THICKNESS / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[width, TABLE_THICKNESS, depth]} />
        <meshStandardMaterial color={TABLE_TOP} roughness={0.85} metalness={0.05} />
      </mesh>

      {([
        [width / 2 - inset, depth / 2 - inset],
        [width / 2 - inset, -(depth / 2 - inset)],
        [-(width / 2 - inset), depth / 2 - inset],
        [-(width / 2 - inset), -(depth / 2 - inset)],
      ] as const).map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, legY, z]} castShadow>
          <boxGeometry args={[LEG_THICKNESS, legHeight, LEG_THICKNESS]} />
          <meshStandardMaterial color={TABLE_LEG} roughness={0.7} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}
