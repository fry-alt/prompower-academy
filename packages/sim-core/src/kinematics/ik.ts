import type { Pose } from '../program/ast';
import type { Vec3 } from '../world/state';
import { forwardKinematics, jointFrames, type KinematicChain } from './chain';
import { clampJointValue } from './joint-limits';
import { solveLinearSystem } from './linear-solve';
import { fromPose, translationOf, type Matrix4 } from './transform';

/**
 * Обратная кинематика методом демпфированных наименьших квадратов.
 *
 * Метод тот, что назван в §4.2 брифа. Реализован здесь, а не взят из
 * `closed-chain-ik`, потому что у того в peer-зависимостях three.js и
 * urdf-loader, а §3 запрещает three.js в `sim-core` — иначе задания уроков
 * нельзя будет проверять в CI без браузера. Замкнутых цепей у нас нет,
 * шестиосевой руке хватает системы 6×6 на итерацию.
 *
 * Число итераций ограничено намеренно: вкладка не должна подвисать на
 * недостижимой точке.
 */

export interface IkOptions {
  readonly maxIterations?: number;
  /** Допуск по положению, метры. */
  readonly positionTolerance?: number;
  /** Допуск по ориентации, радианы. */
  readonly orientationTolerance?: number;
  /** Демпфирование: больше — устойчивее у вырождений, но сходится медленнее. */
  readonly damping?: number;
  /** Предел изменения одного сустава за итерацию, радианы. */
  readonly stepLimit?: number;
}

export type IkResult =
  | { readonly ok: true; readonly joints: readonly number[]; readonly iterations: number }
  | { readonly ok: false; readonly reason: string };

const DEFAULTS = {
  maxIterations: 100,
  positionTolerance: 0.001,
  orientationTolerance: 0.01,
  damping: 0.05,
  stepLimit: 0.2,
} as const;

/**
 * Ищет углы суставов для заданной позы фланца.
 *
 * `seed` — поза, из которой начинаем: обычно текущая. Она же определяет, какое
 * из решений будет выбрано, — у шестиосевой руки их обычно несколько.
 */
export function solveIk(
  chain: KinematicChain,
  target: Pose,
  seed: readonly number[],
  options: IkOptions = {},
): IkResult {
  const settings = { ...DEFAULTS, ...options };

  if (seed.length !== chain.joints.length) {
    return {
      ok: false,
      reason: `Ожидалось ${chain.joints.length} значений суставов, получено ${seed.length}`,
    };
  }

  const targetMatrix = fromPose(target);
  let joints = clampAll(chain, seed);

  for (let iteration = 1; iteration <= settings.maxIterations; iteration += 1) {
    const current = forwardKinematics(chain, joints);
    const error = poseError(targetMatrix, current);

    if (
      norm(error.slice(0, 3)) < settings.positionTolerance &&
      norm(error.slice(3, 6)) < settings.orientationTolerance
    ) {
      return { ok: true, joints, iterations: iteration };
    }

    const jacobian = buildJacobian(chain, joints, translationOf(current));
    const delta = dampedStep(jacobian, error, settings.damping);
    if (delta === null) {
      return { ok: false, reason: unreachable(chain, joints) };
    }

    joints = clampAll(
      chain,
      joints.map((value, index) => value + limitStep(delta[index] ?? 0, settings.stepLimit)),
    );
  }

  return { ok: false, reason: unreachable(chain, joints) };
}

/**
 * Текст для пользователя, а не для лога.
 *
 * Различаем два случая: цель просто далеко и цель недостижима из-за упёршегося
 * сустава — совет ученику в этих случаях разный.
 */
function unreachable(chain: KinematicChain, joints: readonly number[]): string {
  const pinned = chain.joints.filter((joint, index) => {
    if (joint.limit.type === 'continuous') return false;
    const value = joints[index] ?? 0;
    return (
      Math.abs(value - joint.limit.lower) < 1e-6 || Math.abs(value - joint.limit.upper) < 1e-6
    );
  });

  if (pinned.length > 0) {
    const names = pinned.map((joint) => joint.name).join(', ');
    return `Точку не достать: сустав ${names} упирается в свой предел. Подойдите с другой стороны.`;
  }

  return 'Точка недостижима — цель за пределами рабочей зоны';
}

function clampAll(chain: KinematicChain, values: readonly number[]): number[] {
  return chain.joints.map((joint, index) => clampJointValue(joint.limit, values[index] ?? 0));
}

function limitStep(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Шаг демпфированных наименьших квадратов: `Δq = Jᵀ (J Jᵀ + λ²I)⁻¹ e`.
 *
 * Решаем систему 6×6 в пространстве задачи, а не n×n в пространстве суставов:
 * размер не зависит от числа осей робота.
 */
function dampedStep(
  jacobian: readonly (readonly number[])[],
  error: readonly number[],
  damping: number,
): number[] | null {
  const rows = jacobian.length;
  const square: number[][] = [];

  for (let i = 0; i < rows; i += 1) {
    const row: number[] = [];
    for (let j = 0; j < rows; j += 1) {
      let sum = 0;
      for (let k = 0; k < (jacobian[i]?.length ?? 0); k += 1) {
        sum += (jacobian[i]?.[k] ?? 0) * (jacobian[j]?.[k] ?? 0);
      }
      row.push(i === j ? sum + damping * damping : sum);
    }
    square.push(row);
  }

  const lambda = solveLinearSystem(square, error);
  if (lambda === null) return null;

  const columns = jacobian[0]?.length ?? 0;
  const delta = new Array<number>(columns).fill(0);
  for (let k = 0; k < columns; k += 1) {
    let sum = 0;
    for (let i = 0; i < rows; i += 1) {
      sum += (jacobian[i]?.[k] ?? 0) * (lambda[i] ?? 0);
    }
    delta[k] = sum;
  }
  return delta;
}

/**
 * Матрица Якоби 6×n: как скорость каждого сустава влияет на скорость фланца.
 *
 * Для поворотного сустава линейная часть — векторное произведение его оси на
 * плечо до фланца, угловая часть — сама ось. Для линейного наоборот: он двигает,
 * но не поворачивает.
 */
function buildJacobian(
  chain: KinematicChain,
  joints: readonly number[],
  endPoint: Vec3,
): number[][] {
  const frames = jointFrames(chain, joints);
  const jacobian: number[][] = [[], [], [], [], [], []];

  for (const [index, joint] of chain.joints.entries()) {
    const frame = frames[index] ?? [];
    const axis = rotateVector(frame, joint.axis);
    const origin = translationOf(frame);

    if (joint.limit.type === 'prismatic') {
      pushColumn(jacobian, axis, { x: 0, y: 0, z: 0 });
      continue;
    }

    const arm = { x: endPoint.x - origin.x, y: endPoint.y - origin.y, z: endPoint.z - origin.z };
    pushColumn(jacobian, cross(axis, arm), axis);
  }

  return jacobian;
}

function pushColumn(jacobian: number[][], linear: Vec3, angular: Vec3): void {
  jacobian[0]!.push(linear.x);
  jacobian[1]!.push(linear.y);
  jacobian[2]!.push(linear.z);
  jacobian[3]!.push(angular.x);
  jacobian[4]!.push(angular.y);
  jacobian[5]!.push(angular.z);
}

/** Ошибка позы как винт: три компоненты сдвига и три поворота. */
function poseError(target: Matrix4, current: Matrix4): number[] {
  const dp = {
    x: (target[3] ?? 0) - (current[3] ?? 0),
    y: (target[7] ?? 0) - (current[7] ?? 0),
    z: (target[11] ?? 0) - (current[11] ?? 0),
  };
  const dr = rotationError(target, current);
  return [dp.x, dp.y, dp.z, dr.x, dr.y, dr.z];
}

/**
 * Вектор поворота из текущей ориентации в целевую: `R_цель · R_текущаяᵀ`,
 * переведённое в ось, умноженную на угол.
 */
function rotationError(target: Matrix4, current: Matrix4): Vec3 {
  const r = multiplyByTranspose(target, current);
  const w = {
    x: (r[7]! - r[5]!) / 2,
    y: (r[2]! - r[6]!) / 2,
    z: (r[3]! - r[1]!) / 2,
  };

  const sin = Math.hypot(w.x, w.y, w.z);
  const cos = (r[0]! + r[4]! + r[8]! - 1) / 2;
  const angle = Math.atan2(sin, cos);

  // Кососимметричная часть вырождается в ноль на обоих концах: и у нулевого
  // поворота, и у разворота на 180°. Различает их знак косинуса — без этого
  // полный разворот выглядел бы как «доворачивать нечего», и решатель отчитался
  // бы об успехе, не тронув ориентацию.
  if (sin < 1e-9) {
    if (cos > 0) return { x: 0, y: 0, z: 0 };
    return halfTurn(r, angle);
  }

  const scale = angle / sin;
  return { x: w.x * scale, y: w.y * scale, z: w.z * scale };
}

/**
 * Ось разворота на 180°, добытая из симметричной части: там `R = 2·a·aᵀ − I`,
 * то есть `R + I = 2·a·aᵀ`, и любой ненулевой столбец сонаправлен оси.
 *
 * Берём столбец с наибольшим диагональным элементом: он дальше всех от нуля, и
 * нормировка выходит устойчивой. Знак оси не важен — поворот на +180° и на
 * −180° вокруг неё это один и тот же поворот.
 */
function halfTurn(r: readonly number[], angle: number): Vec3 {
  const plus = [
    r[0]! + 1, r[1]!, r[2]!,
    r[3]!, r[4]! + 1, r[5]!,
    r[6]!, r[7]!, r[8]! + 1,
  ];

  let column = 0;
  if (plus[4]! > plus[0]!) column = 1;
  if (plus[8]! > plus[column * 4]!) column = 2;

  const axis = { x: plus[column]!, y: plus[3 + column]!, z: plus[6 + column]! };
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length < 1e-9) return { x: 0, y: 0, z: 0 };

  const scale = angle / length;
  return { x: axis.x * scale, y: axis.y * scale, z: axis.z * scale };
}

/** Поворотная часть произведения `a · bᵀ`, разложенная построчно в девять чисел. */
function multiplyByTranspose(a: Matrix4, b: Matrix4): number[] {
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += (a[row * 4 + k] ?? 0) * (b[column * 4 + k] ?? 0);
      }
      out[row * 3 + column] = sum;
    }
  }
  return out;
}

function rotateVector(m: Matrix4, v: Vec3): Vec3 {
  return {
    x: (m[0] ?? 0) * v.x + (m[1] ?? 0) * v.y + (m[2] ?? 0) * v.z,
    y: (m[4] ?? 0) * v.x + (m[5] ?? 0) * v.y + (m[6] ?? 0) * v.z,
    z: (m[8] ?? 0) * v.x + (m[9] ?? 0) * v.y + (m[10] ?? 0) * v.z,
  };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(values: readonly number[]): number {
  return Math.hypot(...values);
}
