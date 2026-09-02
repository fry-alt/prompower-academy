import { distanceToBox } from './aabb';
import type { SceneObject, Vec3 } from './state';

/**
 * Что находится между губок захвата.
 *
 * Раньше `gripper close` брал первый объект сцены, какой попадётся, — это
 * работало, пока не было прямой кинематики и позиция схвата была неизвестна.
 * Теперь известна, и захват срабатывает, только если деталь действительно рядом.
 *
 * Форма детали — ограничивающий параллелепипед, точнее мы не моделируем (§4.3
 * брифа). Для «взять кубик со стола» этого достаточно.
 */

/** Расстояние от точки до детали. Ноль — точка внутри или на грани. */
export function distanceToObject(point: Vec3, object: SceneObject): number {
  return distanceToBox(point, object);
}

/**
 * Ближайшая к схвату деталь в пределах досягаемости губок.
 *
 * Когда рядом сразу несколько, берётся ближайшая: так же поступил бы человек,
 * а результат остаётся детерминированным. При равном расстоянии решает порядок
 * идентификаторов — иначе результат зависел бы от порядка ключей объекта.
 */
export function nearestGraspable(
  objects: Readonly<Record<string, SceneObject>>,
  point: Vec3,
  reach: number,
): string | null {
  let best: { id: string; distance: number } | null = null;

  for (const id of Object.keys(objects).sort()) {
    const object = objects[id];
    if (object === undefined) continue;

    const distance = distanceToObject(point, object);
    if (distance > reach) continue;
    if (best === null || distance < best.distance) best = { id, distance };
  }

  return best?.id ?? null;
}
