import type { MotionParams, Pose } from '../program/ast';
import type { Vec3 } from '../world/state';

/**
 * Граница между интерпретатором и кинематикой.
 *
 * Интерпретатор не знает ни про URDF, ни про матрицу Якоби: он просит
 * спланировать движение и получает либо траекторию, либо отказ с человеческим
 * объяснением. Благодаря этому логику программы можно проверять тестами без
 * единой модели робота.
 */

export interface MotionPlan {
  /** Углы суставов в конце движения, радианы. */
  readonly joints: readonly number[];
  /** Длительность в тиках. Считается детерминированно из скорости и расстояния. */
  readonly ticks: number;
  /**
   * Промежуточные позы, включая конечную. По ним проверяются столкновения и по
   * ним же сцена проигрывает движение.
   */
  readonly waypoints: readonly (readonly number[])[];
}

/** Причина отказа — текст для пользователя, а не для лога разработчика. */
export interface MotionRefusal {
  readonly reason: string;
}

export type MotionResult =
  | { readonly ok: true; readonly plan: MotionPlan }
  | { readonly ok: false; readonly refusal: MotionRefusal };

export interface MotionPlanner {
  /** Движение сустав в сустав: цель задана углами. */
  planJoint(
    from: readonly number[],
    target: readonly number[],
    params: MotionParams,
  ): MotionResult;

  /**
   * Движение фланца по прямой: цель задана позой. Недостижимая точка или выход
   * за предел сустава — отказ, робот при этом не двигается.
   */
  planLinear(from: readonly number[], target: Pose, params: MotionParams): MotionResult;

  /**
   * Куда попадёт точка, закреплённая на фланце со смещением `offset`.
   *
   * Через это интерпретатор узнаёт, где сейчас схват и куда уезжает зажатая
   * деталь. Матрицы наружу не выходят: снаружи только точки в системе сцены.
   */
  flangePoint(joints: readonly number[], offset: Vec3): Vec3;

  /** Обратное: смещение точки сцены в системе фланца. Нужно в момент захвата. */
  offsetFromFlange(joints: readonly number[], point: Vec3): Vec3;
}

export function planned(plan: MotionPlan): MotionResult {
  return { ok: true, plan };
}

export function refused(reason: string): MotionResult {
  return { ok: false, refusal: { reason } };
}
