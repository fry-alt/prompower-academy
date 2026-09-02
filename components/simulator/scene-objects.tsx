'use client';

import { useMemo } from 'react';
import { DoubleSide, PlaneGeometry } from 'three';
import type { SceneObject, Vec3, Zone } from '@prompower/sim-core';

/**
 * Детали и зоны на столе.
 *
 * Состояние мира живёт в системе координат URDF, где вверх — ось Z, а three.js
 * работает с осью Y вверх. Пересчёт собран в одном месте ниже: если растащить
 * его по компонентам, рано или поздно деталь уедет не туда, и искать будет
 * негде.
 */

/** URDF (x, y, z) → three (x, z, −y). Тот же разворот, что у корня робота. */
function toScene(point: Vec3): [number, number, number] {
  return [point.x, point.z, -point.y];
}

function sizeToScene(size: Vec3): [number, number, number] {
  return [size.x, size.z, size.y];
}

export function SceneObjects({
  objects,
  zones,
  heldId,
}: {
  objects: Readonly<Record<string, SceneObject>>;
  zones: Readonly<Record<string, Zone>>;
  /** Деталь в захвате подсвечивается: видно, что робот её действительно взял. */
  heldId: string | null;
}) {
  const zoneList = useMemo(() => Object.values(zones), [zones]);
  const objectList = useMemo(() => Object.values(objects), [objects]);

  return (
    <group>
      {zoneList.map((zone) => (
        <group key={zone.id} position={toScene({ ...zone.position, z: 0.002 })}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[zone.size.x, zone.size.y]} />
            <meshBasicMaterial color="#7c8798" transparent opacity={0.4} side={DoubleSide} />
          </mesh>
          {/* Контур: без него площадка сливается со столешницей под углом. */}
          <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
            <edgesGeometry args={[new PlaneGeometry(zone.size.x, zone.size.y)]} />
            <lineBasicMaterial color="#aab4c2" />
          </lineSegments>
        </group>
      ))}

      {objectList.map((object) => (
        <mesh key={object.id} position={toScene(object.position)} castShadow receiveShadow>
          <boxGeometry args={sizeToScene(object.size)} />
          <meshPhongMaterial
            color={object.id === heldId ? '#e08a3c' : '#9aa3ad'}
            shininess={30}
          />
        </mesh>
      ))}
    </group>
  );
}
