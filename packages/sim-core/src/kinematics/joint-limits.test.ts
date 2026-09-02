import { describe, expect, it } from 'vitest';
import {
  clampJointValue,
  clampJointVector,
  isWithinLimits,
  normalizeAngle,
  type JointLimit,
} from './joint-limits';

const revolute: JointLimit = { name: 'j1', type: 'revolute', lower: -1, upper: 2 };
const continuous: JointLimit = { name: 'j6', type: 'continuous', lower: 0, upper: 0 };

describe('clampJointValue', () => {
  it('оставляет значение внутри диапазона без изменений', () => {
    expect(clampJointValue(revolute, 0.5)).toBe(0.5);
  });

  it('подтягивает значение ниже диапазона к нижнему пределу', () => {
    expect(clampJointValue(revolute, -10)).toBe(-1);
  });

  it('подтягивает значение выше диапазона к верхнему пределу', () => {
    expect(clampJointValue(revolute, 10)).toBe(2);
  });

  it('пропускает значения ровно на границах', () => {
    expect(clampJointValue(revolute, -1)).toBe(-1);
    expect(clampJointValue(revolute, 2)).toBe(2);
  });

  it('заворачивает непрерывный сустав вместо зажима', () => {
    expect(clampJointValue(continuous, Math.PI * 3)).toBeCloseTo(Math.PI, 12);
    expect(clampJointValue(continuous, -Math.PI * 3)).toBeCloseTo(Math.PI, 12);
  });

  it('отвергает нечисловое значение', () => {
    expect(() => clampJointValue(revolute, Number.NaN)).toThrow(RangeError);
    expect(() => clampJointValue(revolute, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('отвергает перевёрнутые пределы', () => {
    const broken: JointLimit = { name: 'j2', type: 'revolute', lower: 1, upper: -1 };
    expect(() => clampJointValue(broken, 0)).toThrow(/больше верхнего/);
  });
});

describe('clampJointVector', () => {
  it('зажимает каждое значение по своему суставу', () => {
    const limits: JointLimit[] = [revolute, { name: 'j2', type: 'revolute', lower: 0, upper: 1 }];
    expect(clampJointVector(limits, [5, -5])).toEqual([2, 0]);
  });

  it('отвергает вектор неверной длины', () => {
    expect(() => clampJointVector([revolute], [0, 0])).toThrow(/Ожидалось 1 значений/);
  });
});

describe('isWithinLimits', () => {
  it('различает значения внутри и снаружи диапазона', () => {
    expect(isWithinLimits(revolute, 0)).toBe(true);
    expect(isWithinLimits(revolute, 2.001)).toBe(false);
  });

  it('считает непрерывный сустав неограниченным', () => {
    expect(isWithinLimits(continuous, 1e6)).toBe(true);
  });

  it('считает нечисловое значение выходящим за пределы', () => {
    expect(isWithinLimits(revolute, Number.NaN)).toBe(false);
  });
});

describe('normalizeAngle', () => {
  it('не трогает углы внутри (-PI, PI]', () => {
    expect(normalizeAngle(1)).toBeCloseTo(1, 12);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it('заворачивает полный оборот в ноль', () => {
    expect(normalizeAngle(Math.PI * 2)).toBeCloseTo(0, 12);
  });

  it('отвергает нечисловой угол', () => {
    expect(() => normalizeAngle(Number.NaN)).toThrow(RangeError);
  });
});
