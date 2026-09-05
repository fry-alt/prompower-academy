import { describe, expect, it } from 'vitest';
import {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  easeInOut,
  interpolateJoints,
  motionDuration,
} from './joint-motion';

const HOME = [0, 0.4, -0.8, 0, 0.4, 0];

describe('motionDuration', () => {
  it('большое движение длится дольше малого', () => {
    const small = motionDuration(HOME, [0, 0.41, -0.8, 0, 0.4, 0]);
    const large = motionDuration(HOME, [0, 0.4 + Math.PI, -0.8, 0, 0.4, 0]);

    expect(large).toBeGreaterThan(small);
  });

  it('считает по самому подвижному суставу, а не по сумме', () => {
    // Один сустав на 0.5 рад против шести по 0.5 рад: рука едет всеми сразу,
    // поэтому длительность одинаковая.
    const one = motionDuration(
      HOME,
      HOME.map((v, i) => (i === 1 ? v + 0.5 : v)),
    );
    const all = motionDuration(
      HOME,
      HOME.map((v) => v + 0.5),
    );

    expect(all).toBeCloseTo(one, 5);
  });

  it('не короче нижней границы и не длиннее верхней', () => {
    expect(motionDuration(HOME, HOME)).toBe(MIN_DURATION_MS);
    expect(motionDuration(HOME, HOME.map((v) => v + 100))).toBe(MAX_DURATION_MS);
  });
});

describe('interpolateJoints', () => {
  it('в начале даёт исходную позу, в конце целевую', () => {
    const to = [0.1, 0.5, -0.7, 0.2, 0.3, 0.4];

    expect(interpolateJoints(HOME, to, 0)).toEqual(HOME);
    expect(interpolateJoints(HOME, to, 1)).toEqual(to);
  });

  it('на половине пути даёт середину', () => {
    const result = interpolateJoints([0, 0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6], 0.5);

    expect(result).toEqual([0.5, 1, 1.5, 2, 2.5, 3]);
  });

  it('короткий вектор целевой позы не роняет вычисление', () => {
    // Смена модели робота меняет число суставов: пока новая поза не доехала,
    // векторы разной длины встречаются на один кадр.
    expect(interpolateJoints([0, 1, 2], [4], 0.5)).toEqual([2, 0.5, 1]);
  });
});

describe('easeInOut', () => {
  it('закреплён на концах и в середине', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  });

  it('монотонно растёт', () => {
    const points = [0, 0.2, 0.4, 0.6, 0.8, 1].map(easeInOut);

    for (let i = 1; i < points.length; i += 1) {
      expect(points[i] ?? 0).toBeGreaterThan(points[i - 1] ?? 0);
    }
  });

  it('в начале и в конце медленнее, чем в середине', () => {
    // Смысл сглаживания: трогаться и останавливаться плавно.
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
  });
});
