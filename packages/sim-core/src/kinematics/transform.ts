import type { Pose } from '../program/ast';
import type { Vec3 } from '../world/state';

/**
 * Однородные преобразования 4×4 для кинематики.
 *
 * Своя маленькая матричная арифметика вместо three.js: `sim-core` обязан
 * работать в CI без браузера (§3 брифа), а здесь нужен десяток операций, а не
 * графическая библиотека.
 *
 * Хранение построчное: элемент строки `r` и столбца `c` лежит по индексу
 * `r * 4 + c`. Точка преобразуется как `p' = M · p`.
 */

export type Matrix4 = readonly number[];

export const IDENTITY: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function multiply(a: Matrix4, b: Matrix4): Matrix4 {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (a[row * 4 + k] ?? 0) * (b[k * 4 + col] ?? 0);
      }
      out[row * 4 + col] = sum;
    }
  }
  return out;
}

export function fromTranslation(v: Vec3): Matrix4 {
  return [1, 0, 0, v.x, 0, 1, 0, v.y, 0, 0, 1, v.z, 0, 0, 0, 1];
}

/**
 * Поворот из углов URDF: неподвижные оси, порядок roll-pitch-yaw.
 * Это `Rz(yaw) · Ry(pitch) · Rx(roll)` — так задан `<origin rpy>` в стандарте.
 */
export function fromRpy(roll: number, pitch: number, yaw: number): Matrix4 {
  const [sr, cr] = [Math.sin(roll), Math.cos(roll)];
  const [sp, cp] = [Math.sin(pitch), Math.cos(pitch)];
  const [sy, cy] = [Math.sin(yaw), Math.cos(yaw)];

  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, 0,
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, 0,
    -sp, cp * sr, cp * cr, 0,
    0, 0, 0, 1,
  ];
}

/** Начало координат сустава или визуала: сдвиг, затем поворот. */
export function fromOrigin(xyz: Vec3, rpy: Vec3): Matrix4 {
  return multiply(fromTranslation(xyz), fromRpy(rpy.x, rpy.y, rpy.z));
}

/** Поворот вокруг произвольной оси, формула Родрига. Ось нормализуется. */
export function fromAxisAngle(axis: Vec3, angle: number): Matrix4 {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length === 0) {
    throw new RangeError('Ось поворота нулевой длины: в URDF у сустава не задан axis');
  }

  const [x, y, z] = [axis.x / length, axis.y / length, axis.z / length];
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const t = 1 - c;

  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}

/** Сдвиг вдоль оси — для линейных суставов. */
export function fromAxisTranslation(axis: Vec3, distance: number): Matrix4 {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length === 0) {
    throw new RangeError('Ось перемещения нулевой длины: в URDF у сустава не задан axis');
  }
  return fromTranslation({
    x: (axis.x / length) * distance,
    y: (axis.y / length) * distance,
    z: (axis.z / length) * distance,
  });
}

export function translationOf(m: Matrix4): Vec3 {
  return { x: m[3] ?? 0, y: m[7] ?? 0, z: m[11] ?? 0 };
}

export function transformPoint(m: Matrix4, v: Vec3): Vec3 {
  return {
    x: (m[0] ?? 0) * v.x + (m[1] ?? 0) * v.y + (m[2] ?? 0) * v.z + (m[3] ?? 0),
    y: (m[4] ?? 0) * v.x + (m[5] ?? 0) * v.y + (m[6] ?? 0) * v.z + (m[7] ?? 0),
    z: (m[8] ?? 0) * v.x + (m[9] ?? 0) * v.y + (m[10] ?? 0) * v.z + (m[11] ?? 0),
  };
}

/**
 * Обратное преобразование. Матрица однородная, поэтому поворот обращается
 * транспонированием, а сдвиг — поворотом обратно со знаком минус.
 */
export function invert(m: Matrix4): Matrix4 {
  const t = translationOf(m);
  const r = [m[0] ?? 0, m[4] ?? 0, m[8] ?? 0, m[1] ?? 0, m[5] ?? 0, m[9] ?? 0, m[2] ?? 0, m[6] ?? 0, m[10] ?? 0];
  return [
    r[0]!, r[1]!, r[2]!, -(r[0]! * t.x + r[1]! * t.y + r[2]! * t.z),
    r[3]!, r[4]!, r[5]!, -(r[3]! * t.x + r[4]! * t.y + r[5]! * t.z),
    r[6]!, r[7]!, r[8]!, -(r[6]! * t.x + r[7]! * t.y + r[8]! * t.z),
    0, 0, 0, 1,
  ];
}

/**
 * Углы roll-pitch-yaw из матрицы поворота.
 *
 * В шарнирном замке (тангаж ±90°) крен и рыскание сливаются в один поворот;
 * тогда крен принимается нулевым — иначе значения скачут от шума в младших
 * разрядах, а на экране это выглядит как дрожание позы.
 */
export function rpyOf(m: Matrix4): Vec3 {
  const sinPitch = -(m[8] ?? 0);

  if (Math.abs(sinPitch) > 0.999_999) {
    const pitch = Math.sign(sinPitch) * (Math.PI / 2);
    return { x: 0, y: pitch, z: Math.atan2(-(m[1] ?? 0), m[5] ?? 0) };
  }

  return {
    x: Math.atan2(m[9] ?? 0, m[10] ?? 0),
    y: Math.asin(sinPitch),
    z: Math.atan2(m[4] ?? 0, m[0] ?? 0),
  };
}

export function poseOf(m: Matrix4): Pose {
  const position = translationOf(m);
  const rpy = rpyOf(m);
  return { x: position.x, y: position.y, z: position.z, rx: rpy.x, ry: rpy.y, rz: rpy.z };
}

export function fromPose(pose: Pose): Matrix4 {
  return fromOrigin({ x: pose.x, y: pose.y, z: pose.z }, { x: pose.rx, y: pose.ry, z: pose.rz });
}
