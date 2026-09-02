import type { JointDescriptor, JointLimit, JointType } from '@prompower/sim-core';

/**
 * Извлечение пределов суставов из разобранного URDF.
 *
 * Тип сустава берётся из URDF, а не из конфига плагина: это характеристика
 * робота. В серии JAKA у Zu 12 суставы объявлены `continuous`, а у остальных
 * `revolute` — на поведение ползунка это влияет, но конфига не касается.
 *
 * Модуль описывает робота структурно, а не через типы urdf-loader: так его
 * можно проверить обычными объектами, не поднимая three.js в тестах.
 */

function isSupported(jointType: string): jointType is JointType {
  return jointType === 'revolute' || jointType === 'continuous' || jointType === 'prismatic';
}

export interface UrdfJointLike {
  readonly jointType: string;
  readonly limit: { readonly lower: number; readonly upper: number };
}

export interface UrdfRobotLike {
  readonly joints: Readonly<Record<string, UrdfJointLike | undefined>>;
}

export interface JointMismatch {
  readonly urdfName: string;
  /** `null` — сустава с таким именем в URDF вовсе нет. */
  readonly actual: string | null;
}

/** URDF не совпал с конфигом плагина: чинить конфиг или модель, а не показывать пустую сцену. */
export class UrdfMismatchError extends Error {
  constructor(readonly mismatches: readonly JointMismatch[]) {
    const detail = mismatches
      .map((m) =>
        m.actual === null
          ? `${m.urdfName}: нет в URDF`
          : `${m.urdfName}: тип «${m.actual}» не поддерживается симулятором`,
      )
      .join('; ');
    super(`URDF не совпадает с конфигом плагина — ${detail}`);
    this.name = 'UrdfMismatchError';
  }
}

/**
 * Возвращает пределы в порядке, заданном плагином. Порядок важен: он же задаёт
 * порядок ползунков и порядок значений в векторе позы.
 */
export function extractJointLimits(
  robot: UrdfRobotLike,
  descriptors: readonly JointDescriptor[],
): JointLimit[] {
  const mismatches: JointMismatch[] = [];
  const limits: JointLimit[] = [];

  for (const descriptor of descriptors) {
    const joint = robot.joints[descriptor.urdfName];

    if (joint === undefined) {
      mismatches.push({ urdfName: descriptor.urdfName, actual: null });
      continue;
    }

    if (!isSupported(joint.jointType)) {
      mismatches.push({ urdfName: descriptor.urdfName, actual: joint.jointType });
      continue;
    }

    limits.push({
      name: descriptor.urdfName,
      type: joint.jointType,
      lower: Number(joint.limit.lower),
      upper: Number(joint.limit.upper),
    });
  }

  if (mismatches.length > 0) throw new UrdfMismatchError(mismatches);
  return limits;
}
