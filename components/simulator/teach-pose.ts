import {
  clampJointVector,
  flangePose,
  jointLimits,
  solveIk,
  type KinematicChain,
  type Pose,
} from '@prompower/sim-core';
import { BLOCK_TYPES } from '@prompower/blocks';

/**
 * Перевод между полями блока движения и углами суставов серой копии.
 *
 * Поля блока — градусы и миллиметры, как на планшете JAKA; углы — радианы, как
 * в URDF. Модуль чистый: ни Blockly, ни three.js, поэтому проверяется в CI без
 * браузера, как и остальная кинематика.
 */

/** Чему учится блок: своим углам или позе фланца. */
export type TeachKind = 'joints' | 'pose';

export type TeachFields = Readonly<Record<string, number>>;

export interface Seed {
  readonly joints: readonly number[];
  /**
   * Удалось ли встать ровно в записанную точку. Ложь означает, что обратная
   * задача решения не нашла и копия поднялась в запасной позе.
   */
  readonly exact: boolean;
}

const JOINT_FIELDS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MM = 1000;

export function teachKindOf(blockType: string): TeachKind | null {
  if (blockType === BLOCK_TYPES.moveJoint) return 'joints';
  if (blockType === BLOCK_TYPES.moveLinear) return 'pose';
  return null;
}

/** Поза, в которой копия поднимается при входе в обучение. */
export function seedJoints(
  kind: TeachKind,
  fields: TeachFields,
  chain: KinematicChain,
  fallback: readonly number[],
): Seed {
  const limits = jointLimits(chain);

  if (kind === 'joints') {
    const raw = JOINT_FIELDS.map((name) => (fields[name] ?? 0) * DEG_TO_RAD);
    return { joints: clampJointVector(limits, raw), exact: true };
  }

  const solved = solveIk(chain, poseFromFields(fields), fallback);
  if (!solved.ok) return { joints: [...fallback], exact: false };

  return { joints: clampJointVector(limits, [...solved.joints]), exact: true };
}

/** Значения полей блока для позы копии. */
export function fieldsFromJoints(
  kind: TeachKind,
  joints: readonly number[],
  chain: KinematicChain,
): TeachFields {
  if (kind === 'joints') {
    return Object.fromEntries(
      JOINT_FIELDS.map((name, index) => [name, degrees(joints[index] ?? 0)]),
    );
  }

  const pose = flangePose(chain, joints);
  return {
    X: millimetres(pose.x),
    Y: millimetres(pose.y),
    Z: millimetres(pose.z),
    RX: degrees(pose.rx),
    RY: degrees(pose.ry),
    RZ: degrees(pose.rz),
  };
}

function poseFromFields(fields: TeachFields): Pose {
  return {
    x: (fields.X ?? 0) / MM,
    y: (fields.Y ?? 0) / MM,
    z: (fields.Z ?? 0) / MM,
    rx: (fields.RX ?? 0) * DEG_TO_RAD,
    ry: (fields.RY ?? 0) * DEG_TO_RAD,
    rz: (fields.RZ ?? 0) * DEG_TO_RAD,
  };
}

/** Точность полей блока: десятые градуса и целые миллиметры. */
function degrees(radians: number): number {
  return zero(Math.round(radians * RAD_TO_DEG * 10) / 10);
}

function millimetres(metres: number): number {
  return zero(Math.round(metres * MM));
}

/** Минус нуль в поле блока смотрится опечаткой. */
function zero(value: number): number {
  return value === 0 ? 0 : value;
}
