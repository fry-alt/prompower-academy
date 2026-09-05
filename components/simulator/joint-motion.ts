/**
 * Арифметика показа движения: сколько оно длится и где рука в середине пути.
 *
 * Модуль лежит здесь, а не в `sim-core`, потому что это показ, а не кинематика.
 * В ядре живёт настоящий планировщик движений с профилями скорости; путать с
 * ним сглаживание картинки не нужно.
 */

/** Угловая скорость показа, рад/с. Не паспортная: столько приятно смотреть. */
const SHOWN_SPEED = 2.4;

export const MIN_DURATION_MS = 90;
export const MAX_DURATION_MS = 900;

/** Сколько шагов в секунду отрабатывается, пока кнопку держат. */
export const HOLD_STEPS_PER_SECOND = 8;

/** Дольше этого нажатие считается удержанием, а не щелчком. */
export const HOLD_THRESHOLD_MS = 250;

/**
 * Длительность показа по самому подвижному суставу.
 *
 * Рука едет всеми суставами одновременно, поэтому решает наибольшее изменение,
 * а не их сумма. Разворот на 180° занимает заметно больше времени, чем шаг в
 * миллиметр, — так же, как у настоящего робота с ограниченной скоростью.
 */
export function motionDuration(from: readonly number[], to: readonly number[]): number {
  let largest = 0;
  const length = Math.max(from.length, to.length);

  for (let index = 0; index < length; index += 1) {
    largest = Math.max(largest, Math.abs((to[index] ?? 0) - (from[index] ?? 0)));
  }

  const milliseconds = (largest / SHOWN_SPEED) * 1000;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, milliseconds));
}

/** Поза на доле `t` пути от `from` к `to`. Длина результата — как у `from`. */
export function interpolateJoints(
  from: readonly number[],
  to: readonly number[],
  t: number,
): number[] {
  return from.map((value, index) => value + ((to[index] ?? 0) - value) * t);
}

/** Сглаживание: трогается и останавливается плавно, в середине быстрее всего. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
