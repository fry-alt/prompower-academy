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

/**
 * Границы ползунка — ровно те, что стоят в URDF, без округления.
 *
 * Шага у ползунка нет намеренно (`step="any"`). Пределы в URDF заданы в радианах
 * и в градусах дают некруглые числа: ±2.094 рад — это ±119.977°. С любым
 * фиксированным шагом сетка значений не прошла бы ни через ноль, ни через сам
 * предел, и подпись «упёрся в предел» не загоралась бы никогда.
 */
export function displayRange(limit: JointLimit): DisplayRange {
  if (limit.type === 'continuous') {
    return { min: -CONTINUOUS_HALF_TURN_DEG, max: CONTINUOUS_HALF_TURN_DEG };
  }
  return { min: toDisplay(limit, limit.lower), max: toDisplay(limit, limit.upper) };
}

/** Значение сустава для показа: градусы с десятыми, метры с миллиметрами. */
export function formatValue(limit: JointLimit, value: number): string {
  return formatDisplay(limit, toDisplay(limit, value));
}

/** Подпись предела под ползунком — в тех же единицах и с той же точностью. */
export function formatDisplay(limit: JointLimit, display: number): string {
  return isAngular(limit) ? display.toFixed(1) : display.toFixed(3);
}
