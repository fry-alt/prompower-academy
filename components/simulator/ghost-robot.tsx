'use client';

import { useEffect, useMemo } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import type { URDFRobot } from 'urdf-loader';
import { applyJointValues } from './pose-robot';

/**
 * Серая копия робота: поза, которую показывают, а не исполняют.
 *
 * Копия — клон загруженной модели, а значит делит с оригиналом геометрию;
 * освобождать её нельзя, иначе исчезнет настоящий робот. Свой у копии только
 * материал, и он один на всех: заводить по материалу на меш незачем.
 */

const GHOST_MATERIAL = new MeshStandardMaterial({
  color: '#9aa4b5',
  transparent: true,
  opacity: 0.5,
  // Прозрачное рисуется после непрозрачного, а глубину копия не пишет: иначе её
  // звенья закрывают друг друга и настоящего робота за ней.
  depthWrite: false,
  roughness: 0.9,
  metalness: 0,
});

export function GhostRobot({
  source,
  jointNames,
  values,
}: {
  source: URDFRobot;
  /** Имена суставов в том же порядке, что и `values`. */
  jointNames: readonly string[];
  /** Углы в радианах, уже зажатые в пределы. */
  values: readonly number[];
}) {
  const ghost = useMemo(() => {
    const clone = source.clone(true) as URDFRobot;

    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.material = GHOST_MATERIAL;
      object.castShadow = false;
      object.receiveShadow = false;
    });

    return clone;
  }, [source]);

  useEffect(() => {
    applyJointValues(ghost, jointNames, values);
  }, [ghost, jointNames, values]);

  return <primitive object={ghost} />;
}
