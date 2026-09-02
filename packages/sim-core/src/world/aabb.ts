import type { SceneObject, Vec3, Zone } from './state';

/**
 * Столкновения и попадание в зону по ограничивающим параллелепипедам.
 *
 * Потолок точности выбран сознательно (§4.3 брифа): вендорский URSim от
 * Universal Robots вообще не моделирует столкновения, и для обучения этого
 * достаточно. Точная геометрия здесь не нужна и стоила бы дорого.
 */

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

export function aabbOf(box: SceneObject | Zone): Aabb {
  const half = { x: box.size.x / 2, y: box.size.y / 2, z: box.size.z / 2 };
  return {
    min: {
      x: box.position.x - half.x,
      y: box.position.y - half.y,
      z: box.position.z - half.z,
    },
    max: {
      x: box.position.x + half.x,
      y: box.position.y + half.y,
      z: box.position.z + half.z,
    },
  };
}

/** Касание гранью столкновением не считаем: детали, стоящие вплотную, — норма. */
export function intersects(a: Aabb, b: Aabb): boolean {
  return (
    a.min.x < b.max.x &&
    a.max.x > b.min.x &&
    a.min.y < b.max.y &&
    a.max.y > b.min.y &&
    a.min.z < b.max.z &&
    a.max.z > b.min.z
  );
}

/**
 * Объект внутри зоны, если внутри его центр по горизонтали и он не висит выше
 * её верхней грани. По вертикали проверка мягче: деталь стоит на столе, а зона
 * задаётся плоской площадкой, и требовать полного вложения было бы придиркой.
 */
export function isInsideZone(object: SceneObject, zone: Zone): boolean {
  const bounds = aabbOf(zone);
  return (
    object.position.x >= bounds.min.x &&
    object.position.x <= bounds.max.x &&
    object.position.z >= bounds.min.z &&
    object.position.z <= bounds.max.z &&
    object.position.y >= bounds.min.y &&
    object.position.y <= bounds.max.y
  );
}
