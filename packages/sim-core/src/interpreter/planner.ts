import { flangePose, type KinematicChain } from '../kinematics/chain';
import { solveIk, type IkOptions } from '../kinematics/ik';
import { fromPose, poseOf, translationOf, type Matrix4 } from '../kinematics/transform';
import { isWithinLimits } from '../kinematics/joint-limits';
import type { MotionParams, Pose } from '../program/ast';
import { TICK_MS } from './run';
import { planned, refused, type MotionPlanner, type MotionResult } from './motion';

/**
 * Планировщик движений поверх кинематики.
 *
 * Это тот самый слой, который интерпретатор дёргает через `MotionPlanner`: он
 * знает про URDF и матрицу Якоби, а интерпретатор — нет.
 *
 * Скорости суставов берутся из `<limit velocity>` в URDF, поэтому у Zu 20
 * запястье крутится быстрее плеча, как и на настоящем роботе. Скорость фланца в
 * URDF не описана — это настройка контроллера, и она живёт в параметрах ниже.
 *
 * Ускорение из программы принимается, но на время движения не влияет: разгонных
 * профилей мы не считаем, как и всей динамики (§4.3 брифа). Оно доедет до
 * сгенерированного Python, где им займётся настоящий контроллер.
 */

export interface PlannerOptions {
  /** Скорость фланца при `speed = 1`, м/с. Настройка контроллера, не робота. */
  readonly linearSpeed?: number;
  /** Насколько часто пишем промежуточные позы: по суставам, радианы. */
  readonly jointStep?: number;
  /** То же для движения по прямой: метры. */
  readonly linearStep?: number;
  /** Потолок числа промежуточных поз, чтобы не раздувать память на длинном пути. */
  readonly maxWaypoints?: number;
  readonly ik?: IkOptions;
}

interface Settings {
  readonly linearSpeed: number;
  readonly jointStep: number;
  readonly linearStep: number;
  readonly maxWaypoints: number;
  readonly ik?: IkOptions;
}

const DEFAULTS: Settings = {
  linearSpeed: 0.25,
  jointStep: 0.05,
  linearStep: 0.005,
  maxWaypoints: 400,
};

const RAD_TO_DEG = 180 / Math.PI;

export function createPlanner(chain: KinematicChain, options: PlannerOptions = {}): MotionPlanner {
  const settings: Settings = { ...DEFAULTS, ...options };

  return {
    planJoint(from, target, params) {
      return planJointMotion(chain, settings, from, target, params);
    },
    planLinear(from, target, params) {
      return planLinearMotion(chain, settings, from, target, params);
    },
  };
}

function planJointMotion(
  chain: KinematicChain,
  settings: Settings,
  from: readonly number[],
  target: readonly number[],
  params: MotionParams,
): MotionResult {
  const lengths = checkLengths(chain, from, target);
  if (lengths !== null) return refused(lengths);

  const outside = outOfLimits(chain, target);
  if (outside !== null) return refused(outside);

  const deltas = target.map((value, index) => value - (from[index] ?? 0));
  const seconds = jointDuration(chain, deltas, params.speed);
  const steps = sampleCount(deltas.map(Math.abs), settings.jointStep, settings.maxWaypoints);

  const waypoints: number[][] = [];
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    waypoints.push(from.map((value, index) => value + (deltas[index] ?? 0) * t));
  }

  return planned({ joints: [...target], ticks: toTicks(seconds), waypoints });
}

/**
 * Движение по прямой: фланец идёт по отрезку, а углы суставов на каждом шаге
 * ищет обратная кинематика.
 *
 * Промежуточные точки решаются по очереди, каждая от предыдущего решения. Так
 * рука не перескакивает между разными конфигурациями посреди пути — а если
 * очередная точка недостижима, отказ приходит с указанием, где именно путь
 * оборвался.
 */
function planLinearMotion(
  chain: KinematicChain,
  settings: Settings,
  from: readonly number[],
  target: Pose,
  params: MotionParams,
): MotionResult {
  if (from.length !== chain.joints.length) {
    return refused(`Ожидалось ${chain.joints.length} значений суставов, получено ${from.length}`);
  }

  const startPose = flangePose(chain, from);
  const distance = Math.hypot(target.x - startPose.x, target.y - startPose.y, target.z - startPose.z);
  const steps = sampleCount([distance], settings.linearStep, settings.maxWaypoints);

  const startMatrix = fromPose(startPose);
  const targetMatrix = fromPose(target);

  const waypoints: number[][] = [];
  let seed = [...from];

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const pose = interpolatePose(startMatrix, targetMatrix, t);
    const solved = solveIk(chain, pose, seed, settings.ik);

    if (!solved.ok) {
      const percent = Math.round(t * 100);
      return refused(
        percent >= 100
          ? solved.reason
          : `${solved.reason}. Путь по прямой обрывается на ${percent}% отрезка.`,
      );
    }

    seed = [...solved.joints];
    waypoints.push(seed);
  }

  const last = waypoints[waypoints.length - 1] ?? [...from];
  const seconds = distance / Math.max(settings.linearSpeed * params.speed, 1e-6);

  return planned({ joints: last, ticks: toTicks(seconds), waypoints });
}

/**
 * Поза на доле `t` пути.
 *
 * Положение идёт по отрезку, ориентация — по кратчайшему повороту между
 * начальной и конечной. Линейная интерполяция углов Эйлера здесь не годится:
 * возле шарнирного замка она даёт петли, которых на реальном роботе нет.
 */
function interpolatePose(from: Matrix4, to: Matrix4, t: number): Pose {
  const a = translationOf(from);
  const b = translationOf(to);
  const position = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };

  const orientation = poseOf(slerpRotation(from, to, t));
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    rx: orientation.rx,
    ry: orientation.ry,
    rz: orientation.rz,
  };
}

/** Поворот из `from` в `to` на долю `t`, через ось и угол относительного поворота. */
function slerpRotation(from: Matrix4, to: Matrix4, t: number): Matrix4 {
  const relative = rotationTo(from, to);
  const angle = Math.acos(Math.min(1, Math.max(-1, (relative[0]! + relative[4]! + relative[8]! - 1) / 2)));

  if (angle < 1e-9) return from;

  const sin = Math.sin(angle);
  const axis = {
    x: (relative[7]! - relative[5]!) / (2 * sin),
    y: (relative[2]! - relative[6]!) / (2 * sin),
    z: (relative[3]! - relative[1]!) / (2 * sin),
  };

  return multiplyRotation(from, rodrigues(axis, angle * t));
}

function rotationTo(from: Matrix4, to: Matrix4): number[] {
  // fromᵀ · to, только поворотная часть.
  const out = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += (from[k * 4 + row] ?? 0) * (to[k * 4 + column] ?? 0);
      }
      out[row * 3 + column] = sum;
    }
  }
  return out;
}

function rodrigues(axis: { x: number; y: number; z: number }, angle: number): number[] {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const k = 1 - c;
  const { x, y, z } = axis;

  return [
    k * x * x + c, k * x * y - s * z, k * x * z + s * y,
    k * x * y + s * z, k * y * y + c, k * y * z - s * x,
    k * x * z - s * y, k * y * z + s * x, k * z * z + c,
  ];
}

/** Умножает поворотную часть матрицы 4×4 на матрицу 3×3, сохраняя сдвиг. */
function multiplyRotation(m: Matrix4, r: readonly number[]): Matrix4 {
  const out = [...m];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) {
        sum += (m[row * 4 + k] ?? 0) * (r[k * 3 + column] ?? 0);
      }
      out[row * 4 + column] = sum;
    }
  }
  return out;
}

function checkLengths(
  chain: KinematicChain,
  from: readonly number[],
  target: readonly number[],
): string | null {
  if (from.length !== chain.joints.length || target.length !== chain.joints.length) {
    return `Ожидалось ${chain.joints.length} значений суставов, получено ${target.length}`;
  }
  return null;
}

/**
 * Проверка целевой позы на пределы. Отказ, а не тихий зажим: программа, которая
 * молча делает не то, что написано, — худшее, чему можно научить.
 */
function outOfLimits(chain: KinematicChain, target: readonly number[]): string | null {
  for (const [index, joint] of chain.joints.entries()) {
    const value = target[index] ?? 0;
    if (isWithinLimits(joint.limit, value)) continue;

    return (
      `Сустав ${joint.name} не поворачивается на ${(value * RAD_TO_DEG).toFixed(1)}°: ` +
      `его предел от ${(joint.limit.lower * RAD_TO_DEG).toFixed(1)}° ` +
      `до ${(joint.limit.upper * RAD_TO_DEG).toFixed(1)}°.`
    );
  }
  return null;
}

/** Движение длится столько, сколько нужно самому медленному суставу. */
function jointDuration(
  chain: KinematicChain,
  deltas: readonly number[],
  speed: number,
): number {
  let seconds = 0;
  for (const [index, joint] of chain.joints.entries()) {
    const limit = Math.max(joint.maxSpeed * speed, 1e-6);
    seconds = Math.max(seconds, Math.abs(deltas[index] ?? 0) / limit);
  }
  return seconds;
}

function sampleCount(magnitudes: readonly number[], step: number, cap: number): number {
  const largest = Math.max(0, ...magnitudes);
  return Math.min(cap, Math.max(1, Math.ceil(largest / step)));
}

function toTicks(seconds: number): number {
  return Math.max(1, Math.round((seconds * 1000) / TICK_MS));
}
