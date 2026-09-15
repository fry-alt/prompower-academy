'use client';

import { useMemo } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import type { Zone } from '@prompower/sim-core';
import { sizeToScene, toScene } from './scene-frame';

/**
 * Запретная зона: объём, куда нельзя въезжать рукой.
 *
 * Зоны заданий лежат на столе и нарисованы плоскими пятнами — эта занимает
 * пространство и рисуется коробкой с контуром. Цвет предупреждения здесь не
 * украшение: он единственный такой в сцене и значит ровно одно.
 *
 * Геометрия контура живёт между рендерами намеренно: в аргументах примитива R3F
 * сравнивает по ссылке, а рендеры во время работы ползунком идут потоком.
 */
export function KeepOutZone({ zone }: { zone: Zone }) {
  const size = sizeToScene(zone.size);
  const edges = useMemo(
    () => new EdgesGeometry(new BoxGeometry(zone.size.x, zone.size.z, zone.size.y)),
    [zone.size.x, zone.size.y, zone.size.z],
  );

  return (
    <group position={toScene(zone.position)}>
      <mesh>
        <boxGeometry args={size} />
        <meshBasicMaterial color="#d98324" transparent opacity={0.12} depthWrite={false} />
      </mesh>

      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#d98324" />
      </lineSegments>
    </group>
  );
}
