import {
  flangePose,
  forwardKinematics,
  jointFrames,
  type KinematicChain,
} from '../kinematics/chain';
import { solveIk, type IkOptions } from '../kinematics/ik';
import {
  fromPose,
  invert,
  poseOf,
  transformPoint,
  translationOf,
  type Matrix4,
} from '../kinematics/transform';
import { isWithinLimits } from '../kinematics/joint-limits';
import type { MotionParams, Pose } from '../program/ast';
import type { Vec3 } from '../world/state';
import { TICK_MS } from '../tick';
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
  /**
   * Скорость поворота инструмента при `speed = 1`, рад/с. Тоже настройка
   * контроллера: движение по прямой с разворотом кисти длится столько, сколько
   * дольше — путь или поворот.
   */
  readonly angularSpeed?: number;
  /** Насколько часто пишем промежуточные позы: по суставам, радианы. */
  readonly jointStep?: number;
  /** То же для движения по прямой: метры. */
  readonly linearStep?: number;
  /** То же для поворота инструмента при движении по прямой: радианы. */
  readonly angularStep?: number;
  /** Потолок числа промежуточных поз, чтобы не раздувать память на длинном пути. */
  readonly maxWaypoints?: number;
  /**
   * Ниже какой высоты узлам руки опускаться нельзя, метры. Ноль — плоскость
   * столешницы: робот стоит на ней, и сквозь неё он проходить не должен.
   */
  readonly minHeight?: number;
  readonly ik?: IkOptions;
}

interface Settings {
  readonly linearSpeed: number;
  readonly angularSpeed: number;
  readonly jointStep: number;
  readonly linearStep: number;
  readonly angularStep: number;
  readonly maxWaypoints: number;
  readonly minHeight: number;
  readonly ik?: IkOptions;
}

const DEFAULTS: Settings = {
  linearSpeed: 0.25,
  angularSpeed: 1,
  jointStep: 0.005,
  linearStep: 0.005,
  angularStep: 0.01,
  maxWaypoints: 400,
  minHeight: 0,
};

const MM = 1000;

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
    flangePoint(joints, offset) {
      return transformPoint(forwardKinematics(chain, joints), offset);
    },
    offsetFromFlange(joints, point) {
      return transformPoint(invert(forwardKinematics(chain, joints)), point);
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
    const pose = from.map((value, index) => value + (deltas[index] ?? 0) * t);

    const collision = belowTable(chain, pose, settings.minHeight);
    if (collision !== null) return refused(collision);

    waypoints.push(pose);
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

  const startMatrix = fromPose(startPose);
  const targetMatrix = fromPose(target);

  // Поворот считается наравне с путём: разворот кисти на месте — тоже движение,
  // и делать его одним прыжком решателя значит потерять ориентацию по дороге.
  const turn = axisAngle(rotationTo(startMatrix, targetMatrix)).angle;
  const steps = Math.max(
    sampleCount([distance], settings.linearStep, settings.maxWaypoints),
    sampleCount([turn], settings.angularStep, settings.maxWaypoints),
  );

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

    const collision = belowTable(chain, solved.joints, settings.minHeight);
    if (collision !== null) return refused(collision);

    seed = [...solved.joints];
    waypoints.push(seed);
  }

  const last = waypoints[waypoints.length - 1] ?? [...from];
  const seconds = Math.max(
    distance / Math.max(settings.linearSpeed * params.speed, 1e-6),
    turn / Math.max(settings.angularSpeed * params.speed, 1e-6),
  );

  return planned({ joints: last, ticks: toTicks(seconds), waypoints });
}

/**
 * Проверка на проход сквозь столешницу.
 *
 * Робот стоит на столе, и опускать под него звенья нельзя — это первое, что
 * замечает человек, глядя на сцену, и первое, чего не бывает на настоящей
 * ячейке.
 *
 * Проверяются начала координат суставов и фланец, а не полная геометрия
 * звеньев: точной формы у нас нет и не будет (§4.3 брифа). Локоть, ушедший под
 * стол, эта проверка ловит — а ради миллиметрового касания кожухом городить
 * точную геометрию незачем.
 */
function belowTable(
  chain: KinematicChain,
  joints: readonly number[],
  minHeight: number,
): string | null {
  const frames = jointFrames(chain, joints);

  for (const [index, frame] of frames.entries()) {
    const z = translationOf(frame).z;
    if (z >= minHeight) continue;

    const name = chain.joints[index]?.name ?? `сустав ${index + 1}`;
    return (
      `Рука прошла бы сквозь стол: сустав ${name} опускается на ` +
      `${Math.round((minHeight - z) * MM)} мм ниже столешницы. ` +
      `Попробуйте зайти в точку с другой стороны.`
    );
  }

  const flange = translationOf(forwardKinematics(chain, joints)).z;
  if (flange < minHeight) {
    return (
      `Рука прошла бы сквозь стол: фланец опускается на ` +
      `${Math.round((minHeight - flange) * MM)} мм ниже столешницы.`
    );
  }

  return null;
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
  const { axis, angle } = axisAngle(rotationTo(from, to));
  if (angle < 1e-9) return from;
  return multiplyRotation(from, rodrigues(axis, angle * t));
}

/**
 * Ось и угол поворота, записанного матрицей 3×3 построчно.
 *
 * Ось берётся из кососимметричной части, пока поворот не близок к 180°. Там
 * она вырождается в ноль на ноль, и деление давало мусор вместо оси — разворот
 * инструмента на пол-оборота превращал путь в NaN. У разворота ось достаётся
 * из симметричной части: `R + I = 2·a·aᵀ`, любой ненулевой столбец ей
 * сонаправлен, а самый длинный — самый устойчивый.
 */
function axisAngle(r: readonly number[]): { axis: { x: number; y: number; z: number }; angle: number } {
  const w = {
    x: (r[7]! - r[5]!) / 2,
    y: (r[2]! - r[6]!) / 2,
    z: (r[3]! - r[1]!) / 2,
  };
  const sin = Math.hypot(w.x, w.y, w.z);
  const cos = (r[0]! + r[4]! + r[8]! - 1) / 2;
  const angle = Math.atan2(sin, cos);

  if (sin > 1e-6) {
    return { axis: { x: w.x / sin, y: w.y / sin, z: w.z / sin }, angle };
  }
  if (cos > 0) return { axis: { x: 0, y: 0, z: 1 }, angle: 0 };

  const diagonal = [r[0]! + 1, r[4]! + 1, r[8]! + 1];
  let column = 0;
  if (diagonal[1]! > diagonal[column]!) column = 1;
  if (diagonal[2]! > diagonal[column]!) column = 2;

  const axis = {
    x: r[column]! + (column === 0 ? 1 : 0),
    y: r[3 + column]! + (column === 1 ? 1 : 0),
    z: r[6 + column]! + (column === 2 ? 1 : 0),
  };
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (length < 1e-9) return { axis: { x: 0, y: 0, z: 1 }, angle: 0 };

  return { axis: { x: axis.x / length, y: axis.y / length, z: axis.z / length }, angle };
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
