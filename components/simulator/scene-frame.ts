import type { Vec3 } from '@prompower/sim-core';

/**
 * Переход из системы координат мира в систему сцены.
 *
 * Состояние мира живёт в координатах URDF, где вверх — ось Z, а three.js
 * работает с осью Y вверх. Пересчёт собран здесь один раз: растащенный по
 * компонентам, он рано или поздно уводит деталь не туда, и искать будет негде.
 */

/** URDF (x, y, z) → three (x, z, −y). Тот же разворот, что у корня робота. */
export function toScene(point: Vec3): [number, number, number] {
  return [point.x, point.z, -point.y];
}

export function sizeToScene(size: Vec3): [number, number, number] {
  return [size.x, size.z, size.y];
}
