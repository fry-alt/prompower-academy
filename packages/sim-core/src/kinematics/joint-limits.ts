/**
 * Пределы суставов и зажим значений в них.
 *
 * Модуль намеренно не знает ни про three.js, ни про URDF: он принимает уже
 * извлечённые числа. Источник пределов — URDF реального робота, здесь они
 * только применяются.
 */

export type JointType = 'revolute' | 'continuous' | 'prismatic';

export interface JointLimit {
  readonly name: string;
  readonly type: JointType;
  /** Радианы для поворотных суставов, метры для линейных. У `continuous` не используется. */
  readonly lower: number;
  readonly upper: number;
}

const TWO_PI = Math.PI * 2;

/** Приводит угол к полуинтервалу (-PI, PI]. */
export function normalizeAngle(radians: number): number {
  if (!Number.isFinite(radians)) {
    throw new RangeError(`Ожидалось конечное число, получено ${radians}`);
  }
  const wrapped = radians - TWO_PI * Math.floor((radians + Math.PI) / TWO_PI);
  // -PI и PI описывают одно положение; выбираем PI, чтобы интервал был полуоткрыт слева.
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

function assertUsableLimit(limit: JointLimit): void {
  if (limit.type === 'continuous') return;
  if (!Number.isFinite(limit.lower) || !Number.isFinite(limit.upper)) {
    throw new RangeError(`Сустав «${limit.name}»: пределы должны быть конечными числами`);
  }
  if (limit.lower > limit.upper) {
    throw new RangeError(
      `Сустав «${limit.name}»: нижний предел ${limit.lower} больше верхнего ${limit.upper}`,
    );
  }
}

/** Зажимает значение сустава в его пределы. Непрерывный сустав заворачивается по кругу. */
export function clampJointValue(limit: JointLimit, value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Сустав «${limit.name}»: ожидалось конечное число, получено ${value}`);
  }
  assertUsableLimit(limit);
  if (limit.type === 'continuous') return normalizeAngle(value);
  return Math.min(limit.upper, Math.max(limit.lower, value));
}

/** Зажимает вектор значений. Длины обязаны совпадать: расхождение — ошибка сборки сцены. */
export function clampJointVector(
  limits: readonly JointLimit[],
  values: readonly number[],
): number[] {
  if (limits.length !== values.length) {
    throw new RangeError(
      `Ожидалось ${limits.length} значений суставов, получено ${values.length}`,
    );
  }
  return limits.map((limit, index) => clampJointValue(limit, values[index]!));
}

/** Проверяет, лежит ли значение в пределах. Непрерывный сустав не ограничен никогда. */
export function isWithinLimits(limit: JointLimit, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  assertUsableLimit(limit);
  if (limit.type === 'continuous') return true;
  return value >= limit.lower && value <= limit.upper;
}
