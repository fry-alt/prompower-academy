'use client';

import type { Vec3 } from '@prompower/sim-core';
import { toScene } from './scene-frame';

/**
 * Метка целевой точки: полупрозрачный шар размером с допуск и ядро в центре.
 *
 * Радиус равен допуску задания намеренно — так ученик видит не «примерно туда»,
 * а ровно ту область, в которой цель засчитывается. Метка живёт, только пока
 * цель не взята: взятую показывать нечего.
 */
export function TargetPoint({ point, radius }: { point: Vec3; radius: number }) {
  return (
    <group position={toScene(point)}>
      <mesh>
        <sphereGeometry args={[radius, 24, 16]} />
        <meshBasicMaterial color="#f3821d" transparent opacity={0.25} depthWrite={false} />
      </mesh>

      <mesh>
        <sphereGeometry args={[radius * 0.15, 12, 8]} />
        <meshBasicMaterial color="#f3821d" />
      </mesh>
    </group>
  );
}
