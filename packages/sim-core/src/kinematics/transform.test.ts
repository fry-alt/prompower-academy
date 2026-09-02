import { describe, expect, it } from 'vitest';
import {
  fromAxisAngle,
  fromAxisTranslation,
  fromOrigin,
  fromPose,
  fromRpy,
  fromTranslation,
  IDENTITY,
  invert,
  multiply,
  poseOf,
  rpyOf,
  transformPoint,
  translationOf,
  type Matrix4,
} from './transform';

const ZERO = { x: 0, y: 0, z: 0 };

function expectPoint(actual: { x: number; y: number; z: number }, x: number, y: number, z: number) {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
  expect(actual.z).toBeCloseTo(z, 9);
}

describe('multiply', () => {
  it('единичная матрица ничего не меняет', () => {
    const m = fromOrigin({ x: 1, y: 2, z: 3 }, { x: 0.1, y: 0.2, z: 0.3 });
    expect(multiply(m, IDENTITY)).toEqual(m);
    expect(multiply(IDENTITY, m)).toEqual(m);
  });

  it('складывает сдвиги', () => {
    const m = multiply(fromTranslation({ x: 1, y: 0, z: 0 }), fromTranslation({ x: 0, y: 2, z: 0 }));
    expectPoint(translationOf(m), 1, 2, 0);
  });

  it('не коммутативна: поворот и сдвиг в разном порядке дают разное', () => {
    const rotate = fromRpy(0, 0, Math.PI / 2);
    const shift = fromTranslation({ x: 1, y: 0, z: 0 });
    expect(translationOf(multiply(rotate, shift))).not.toEqual(translationOf(multiply(shift, rotate)));
  });
});

describe('fromRpy', () => {
  it('поворот на 90° вокруг Z переводит X в Y', () => {
    expectPoint(transformPoint(fromRpy(0, 0, Math.PI / 2), { x: 1, y: 0, z: 0 }), 0, 1, 0);
  });

  it('поворот на 90° вокруг Y переводит Z в X', () => {
    expectPoint(transformPoint(fromRpy(0, Math.PI / 2, 0), { x: 0, y: 0, z: 1 }), 1, 0, 0);
  });

  it('поворот на 90° вокруг X переводит Y в Z', () => {
    expectPoint(transformPoint(fromRpy(Math.PI / 2, 0, 0), { x: 0, y: 1, z: 0 }), 0, 0, 1);
  });

  it('нулевые углы дают единичную матрицу', () => {
    for (const [index, value] of fromRpy(0, 0, 0).entries()) {
      expect(value).toBeCloseTo(IDENTITY[index]!, 12);
    }
  });
});

describe('fromAxisAngle', () => {
  it('совпадает с поворотом вокруг Z', () => {
    const byAxis = fromAxisAngle({ x: 0, y: 0, z: 1 }, 0.7);
    const byRpy = fromRpy(0, 0, 0.7);
    for (const [index, value] of byAxis.entries()) {
      expect(value).toBeCloseTo(byRpy[index]!, 12);
    }
  });

  it('нормализует ось: длина вектора значения не имеет', () => {
    const unit = fromAxisAngle({ x: 0, y: 0, z: 1 }, 0.4);
    const long = fromAxisAngle({ x: 0, y: 0, z: 17 }, 0.4);
    for (const [index, value] of unit.entries()) {
      expect(value).toBeCloseTo(long[index]!, 12);
    }
  });

  it('учитывает знак оси', () => {
    expectPoint(transformPoint(fromAxisAngle({ x: 0, y: 0, z: -1 }, Math.PI / 2), { x: 1, y: 0, z: 0 }), 0, -1, 0);
  });

  it('отвергает нулевую ось', () => {
    expect(() => fromAxisAngle(ZERO, 1)).toThrow(/нулевой длины/);
  });
});

describe('fromAxisTranslation', () => {
  it('двигает вдоль оси на заданное расстояние', () => {
    expectPoint(translationOf(fromAxisTranslation({ x: 0, y: 0, z: 2 }, 0.15)), 0, 0, 0.15);
  });

  it('отвергает нулевую ось', () => {
    expect(() => fromAxisTranslation(ZERO, 1)).toThrow(/нулевой длины/);
  });
});

describe('invert', () => {
  it('возвращает точку на место', () => {
    const m = fromOrigin({ x: 0.3, y: -0.2, z: 1.1 }, { x: 0.4, y: -0.6, z: 1.2 });
    const point = { x: 0.7, y: 0.1, z: -0.3 };
    expectPoint(transformPoint(invert(m), transformPoint(m, point)), point.x, point.y, point.z);
  });

  it('произведение с обратной даёт единичную', () => {
    const m = fromOrigin({ x: 1, y: 2, z: 3 }, { x: 0.2, y: 0.3, z: 0.4 });
    for (const [index, value] of multiply(m, invert(m)).entries()) {
      expect(value).toBeCloseTo(IDENTITY[index]!, 9);
    }
  });
});

describe('rpyOf', () => {
  it('обратна fromRpy', () => {
    const rpy = { x: 0.3, y: -0.8, z: 2.1 };
    const back = rpyOf(fromRpy(rpy.x, rpy.y, rpy.z));
    expectPoint(back, rpy.x, rpy.y, rpy.z);
  });

  it('в шарнирном замке не даёт NaN', () => {
    const angles = rpyOf(fromRpy(0.5, Math.PI / 2, 1.0));
    expect(Number.isFinite(angles.x)).toBe(true);
    expect(Number.isFinite(angles.y)).toBe(true);
    expect(Number.isFinite(angles.z)).toBe(true);
    expect(angles.y).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('poseOf и fromPose', () => {
  it('обратны друг другу', () => {
    const pose = { x: 0.4, y: -0.1, z: 0.9, rx: 0.2, ry: 0.5, rz: -1.1 };
    const back = poseOf(fromPose(pose));

    expect(back.x).toBeCloseTo(pose.x, 9);
    expect(back.y).toBeCloseTo(pose.y, 9);
    expect(back.z).toBeCloseTo(pose.z, 9);
    expect(back.rx).toBeCloseTo(pose.rx, 9);
    expect(back.ry).toBeCloseTo(pose.ry, 9);
    expect(back.rz).toBeCloseTo(pose.rz, 9);
  });
});

describe('fromOrigin', () => {
  it('сначала поворачивает, потом сдвигает — как в URDF', () => {
    const m: Matrix4 = fromOrigin({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: Math.PI / 2 });
    // Точка (1,0,0) поворачивается в (0,1,0), затем сдвигается на (1,0,0).
    expectPoint(transformPoint(m, { x: 1, y: 0, z: 0 }), 1, 1, 0);
  });
});
