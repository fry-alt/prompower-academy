import type { JointLimit } from '@prompower/sim-core';

/**
 * Перевод между внутренними единицами и тем, что видит пользователь.
 *
 * Внутри всё в радианах и метрах, как в URDF. На экране поворотные суставы
 * показываются в градусах: инженер у планшета JAKA думает в градусах, и урок
 * должен говорить на том же языке.
 */

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const CONTINUOUS_HALF_TURN_DEG = 180;

export interface DisplayRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export function isAngular(limit: JointLimit): boolean {
  return limit.type !== 'prismatic';
}

export function toDisplay(limit: JointLimit, value: number): number {
  return isAngular(limit) ? value * RAD_TO_DEG : value;
}

export function fromDisplay(limit: JointLimit, display: number): number {
  return isAngular(limit) ? display * DEG_TO_RAD : display;
}

/** Диапазон и шаг ползунка. Непрерывный сустав крутится в пределах одного оборота. */
export function displayRange(limit: JointLimit): DisplayRange {
  if (limit.type === 'continuous') {
    return { min: -CONTINUOUS_HALF_TURN_DEG, max: CONTINUOUS_HALF_TURN_DEG, step: 0.5 };
  }
  if (limit.type === 'prismatic') {
    return { min: limit.lower, max: limit.upper, step: 0.001 };
  }
  return {
    min: roundToStep(limit.lower * RAD_TO_DEG),
    max: roundToStep(limit.upper * RAD_TO_DEG),
    step: 0.5,
  };
}

/** Значение для показа рядом с ползунком: градусы с десятыми, метры с миллиметрами. */
export function formatValue(limit: JointLimit, value: number): string {
  return isAngular(limit) ? toDisplay(limit, value).toFixed(1) : value.toFixed(3);
}

function roundToStep(degrees: number): number {
  // Пределы из URDF заданы в радианах и в градусах дают хвосты вроде 179.9997.
  return Math.round(degrees * 10) / 10;
}
