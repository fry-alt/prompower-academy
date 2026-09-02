import type { Pose } from '../program/ast';
import type { Vec3 } from '../world/state';
import type { JointLimit } from './joint-limits';
import {
  fromAxisAngle,
  fromAxisTranslation,
  IDENTITY,
  multiply,
  poseOf,
  type Matrix4,
} from './transform';

/**
 * Кинематическая цепь робота: то, что нужно для расчёта позы фланца.
 *
 * Строится из URDF и не зависит ни от three.js, ни от браузера, поэтому
 * прямая и обратная кинематика проверяются в CI (§3 брифа).
 */

export interface ChainJoint {
  readonly name: string;
  readonly limit: JointLimit;
  /**
   * Паспортная скорость сустава из `<limit velocity>` в URDF: рад/с у
   * поворотных, м/с у линейных. У моделей серии Zu она разная и по моделям, и
   * по осям, поэтому в коде её быть не должно.
   */
  readonly maxSpeed: number;
  /** Преобразование от предыдущего подвижного сустава к системе этого. */
  readonly origin: Matrix4;
  /** Ось вращения или перемещения в системе сустава. */
  readonly axis: Vec3;
}

export interface KinematicChain {
  /** Подвижные суставы в порядке конфига плагина. */
  readonly joints: readonly ChainJoint[];
  /** От основания робота до первого подвижного сустава: неподвижные звенья в начале. */
  readonly baseOrigin: Matrix4;
  /** От последнего подвижного сустава до фланца: неподвижные звенья в конце. */
  readonly toolOrigin: Matrix4;
}

/** Смещение сустава относительно его нулевого положения. */
function jointTransform(joint: ChainJoint, value: number): Matrix4 {
  return joint.limit.type === 'prismatic'
    ? fromAxisTranslation(joint.axis, value)
    : fromAxisAngle(joint.axis, value);
}

/**
 * Прямая кинематика: положение фланца по углам суставов.
 *
 * Возвращает преобразование из системы координат основания робота. Значений
 * должно быть столько же, сколько суставов: расхождение — ошибка сборки сцены,
 * а не повод молча дополнить нулями.
 */
export function forwardKinematics(chain: KinematicChain, values: readonly number[]): Matrix4 {
  if (values.length !== chain.joints.length) {
    throw new RangeError(
      `Ожидалось ${chain.joints.length} значений суставов, получено ${values.length}`,
    );
  }

  let transform = chain.baseOrigin;
  for (const [index, joint] of chain.joints.entries()) {
    transform = multiply(transform, joint.origin);
    transform = multiply(transform, jointTransform(joint, values[index] ?? 0));
  }
  return multiply(transform, chain.toolOrigin);
}

export function flangePose(chain: KinematicChain, values: readonly number[]): Pose {
  return poseOf(forwardKinematics(chain, values));
}

/**
 * Преобразования каждого звена по отдельности — от основания до сустава `i`.
 * Нужны матрице Якоби: там для каждого сустава требуется его ось в мировых осях.
 */
export function jointFrames(chain: KinematicChain, values: readonly number[]): Matrix4[] {
  const frames: Matrix4[] = [];
  let transform = chain.baseOrigin;

  for (const [index, joint] of chain.joints.entries()) {
    transform = multiply(transform, joint.origin);
    frames.push(transform);
    transform = multiply(transform, jointTransform(joint, values[index] ?? 0));
  }

  return frames;
}

export function jointLimits(chain: KinematicChain): JointLimit[] {
  return chain.joints.map((joint) => joint.limit);
}

export const EMPTY_CHAIN: KinematicChain = {
  joints: [],
  baseOrigin: IDENTITY,
  toolOrigin: IDENTITY,
};
