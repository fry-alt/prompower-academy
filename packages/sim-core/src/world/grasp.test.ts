import { describe, expect, it } from 'vitest';
import { distanceToObject, nearestGraspable } from './grasp';
import type { SceneObject } from './state';

/** Кубик 40 мм — то, с чем работают в задании «переложи деталь из A в B». */
function cube(id: string, x: number, y: number, z: number): SceneObject {
  return { id, position: { x, y, z }, size: { x: 0.04, y: 0.04, z: 0.04 } };
}

const REACH = 0.05;

describe('distanceToObject', () => {
  const box = cube('c', 0, 0, 0);

  it('внутри детали расстояние нулевое', () => {
    expect(distanceToObject({ x: 0, y: 0, z: 0 }, box)).toBe(0);
    expect(distanceToObject({ x: 0.019, y: 0, z: 0 }, box)).toBe(0);
  });

  it('на грани расстояние нулевое', () => {
    expect(distanceToObject({ x: 0.02, y: 0, z: 0 }, box)).toBeCloseTo(0, 12);
  });

  it('считает зазор по одной оси', () => {
    expect(distanceToObject({ x: 0.1, y: 0, z: 0 }, box)).toBeCloseTo(0.08, 12);
  });

  it('считает зазор по диагонали, а не по сумме осей', () => {
    // Превышение 0.08 по X и 0.08 по Z даёт гипотенузу, а не 0.16.
    expect(distanceToObject({ x: 0.1, y: 0, z: 0.1 }, box)).toBeCloseTo(Math.hypot(0.08, 0.08), 12);
  });
});

describe('nearestGraspable', () => {
  it('берёт деталь, до которой губки дотягиваются', () => {
    const objects = { 'cube-1': cube('cube-1', 0.3, 0.02, 0) };
    expect(nearestGraspable(objects, { x: 0.3, y: 0.05, z: 0 }, REACH)).toBe('cube-1');
  });

  it('не берёт деталь, до которой не дотянуться', () => {
    const objects = { 'cube-1': cube('cube-1', 0.3, 0.02, 0) };
    expect(nearestGraspable(objects, { x: 0.6, y: 0.05, z: 0 }, REACH)).toBeNull();
  });

  it('на пустой сцене возвращает null', () => {
    expect(nearestGraspable({}, { x: 0, y: 0, z: 0 }, REACH)).toBeNull();
  });

  it('из нескольких деталей выбирает ближайшую', () => {
    const objects = {
      'далеко': cube('далеко', 0.04, 0, 0),
      'рядом': cube('рядом', 0.01, 0, 0),
    };
    expect(nearestGraspable(objects, { x: 0, y: 0, z: 0 }, REACH)).toBe('рядом');
  });

  it('детерминирован при равном расстоянии', () => {
    const objects = {
      b: cube('b', 0.1, 0, 0),
      a: cube('a', -0.1, 0, 0),
    };
    const first = nearestGraspable(objects, { x: 0, y: 0, z: 0 }, 0.2);
    const second = nearestGraspable({ a: objects.a, b: objects.b }, { x: 0, y: 0, z: 0 }, 0.2);
    expect(first).toBe(second);
  });

  it('нулевая досягаемость требует попасть внутрь детали', () => {
    const objects = { 'cube-1': cube('cube-1', 0, 0, 0) };
    expect(nearestGraspable(objects, { x: 0, y: 0, z: 0 }, 0)).toBe('cube-1');
    expect(nearestGraspable(objects, { x: 0.03, y: 0, z: 0 }, 0)).toBeNull();
  });
});
