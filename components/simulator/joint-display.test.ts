import { describe, expect, it } from 'vitest';
import type { JointLimit } from '@prompower/sim-core';
import { displayRange, formatValue, fromDisplay, isAngular, toDisplay } from './joint-display';

const revolute: JointLimit = { name: 'j', type: 'revolute', lower: -Math.PI, upper: Math.PI };
const continuous: JointLimit = { name: 'c', type: 'continuous', lower: 0, upper: 0 };
const prismatic: JointLimit = { name: 'p', type: 'prismatic', lower: 0, upper: 0.15 };

describe('isAngular', () => {
  it('относит поворотные и непрерывные суставы к угловым', () => {
    expect(isAngular(revolute)).toBe(true);
    expect(isAngular(continuous)).toBe(true);
    expect(isAngular(prismatic)).toBe(false);
  });
});

describe('toDisplay и fromDisplay', () => {
  it('переводят радианы в градусы и обратно', () => {
    expect(toDisplay(revolute, Math.PI / 2)).toBeCloseTo(90, 9);
    expect(fromDisplay(revolute, 90)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('оставляют линейный сустав в метрах', () => {
    expect(toDisplay(prismatic, 0.05)).toBe(0.05);
    expect(fromDisplay(prismatic, 0.05)).toBe(0.05);
  });

  it('обратимы', () => {
    const radians = 1.2345;
    expect(fromDisplay(revolute, toDisplay(revolute, radians))).toBeCloseTo(radians, 12);
  });
});

describe('displayRange', () => {
  it('округляет хвосты перевода из радиан', () => {
    expect(displayRange(revolute)).toEqual({ min: -180, max: 180, step: 0.5 });
  });

  it('даёт непрерывному суставу один оборот', () => {
    expect(displayRange(continuous)).toEqual({ min: -180, max: 180, step: 0.5 });
  });

  it('оставляет линейному суставу его метры', () => {
    expect(displayRange(prismatic)).toEqual({ min: 0, max: 0.15, step: 0.001 });
  });
});

describe('formatValue', () => {
  it('показывает градусы с десятыми', () => {
    expect(formatValue(revolute, Math.PI)).toBe('180.0');
  });

  it('показывает метры с миллиметрами', () => {
    expect(formatValue(prismatic, 0.0125)).toBe('0.013');
  });
});
