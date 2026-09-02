import { describe, expect, it } from 'vitest';
import { aabbOf, intersects, isInsideZone } from './aabb';
import type { SceneObject, Zone } from './state';

function box(id: string, x: number, y: number, z: number, side = 0.04): SceneObject {
  return { id, position: { x, y, z }, size: { x: side, y: side, z: side } };
}

const zone: Zone = {
  id: 'zone-b',
  position: { x: -0.3, y: 0.05, z: 0 },
  size: { x: 0.2, y: 0.2, z: 0.2 },
};

describe('aabbOf', () => {
  it('раскрывает центр и габариты в границы', () => {
    expect(aabbOf(box('c', 0, 0, 0, 0.1))).toEqual({
      min: { x: -0.05, y: -0.05, z: -0.05 },
      max: { x: 0.05, y: 0.05, z: 0.05 },
    });
  });
});

describe('intersects', () => {
  it('находит пересечение', () => {
    expect(intersects(aabbOf(box('a', 0, 0, 0)), aabbOf(box('b', 0.02, 0, 0)))).toBe(true);
  });

  it('не считает столкновением разнесённые объекты', () => {
    expect(intersects(aabbOf(box('a', 0, 0, 0)), aabbOf(box('b', 1, 0, 0)))).toBe(false);
  });

  it('не считает столкновением касание гранями', () => {
    // Детали, стоящие вплотную, — норма на любом столе.
    expect(intersects(aabbOf(box('a', 0, 0, 0)), aabbOf(box('b', 0.04, 0, 0)))).toBe(false);
  });

  it('требует пересечения по всем трём осям', () => {
    // Совпадают по X и Z, но один висит выше другого.
    expect(intersects(aabbOf(box('a', 0, 0, 0)), aabbOf(box('b', 0, 0.5, 0)))).toBe(false);
  });
});

describe('isInsideZone', () => {
  it('засчитывает деталь в середине зоны', () => {
    expect(isInsideZone(box('c', -0.3, 0.05, 0), zone)).toBe(true);
  });

  it('не засчитывает деталь в стороне', () => {
    expect(isInsideZone(box('c', 0.3, 0.05, 0), zone)).toBe(false);
  });

  it('не засчитывает деталь, висящую выше зоны', () => {
    expect(isInsideZone(box('c', -0.3, 0.5, 0), zone)).toBe(false);
  });

  it('засчитывает деталь ровно на границе', () => {
    expect(isInsideZone(box('c', -0.2, 0.05, 0), zone)).toBe(true);
  });
});
