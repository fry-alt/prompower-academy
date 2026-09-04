import type { Pose } from '../program/ast';
import { forwardKinematics, type KinematicChain } from './chain';
import { solveIk } from './ik';
import {
  fromAxisAngle,
  fromTranslation,
  multiply,
  poseOf,
  translationOf,
  type Matrix4,
} from './transform';

/**
 * Ручное управление в декартовых координатах: шаг фланца по одной оси, переход
 * в заданную позу и постановка инструмента вертикально.
 *
 * Шаг считается матрицами и переводится в позу только на входе в обратную
 * задачу. Углы RPY по дороге не накапливаются: исходная матрица каждый раз
 * берётся прямой задачей от текущих суставов. Поэтому у `ry = ±90°`, где
 * разложение на углы вырождается, рука всё равно едет ровно.
 */

/** В какой системе координат понимать шаг. */
export type JogFrame = 'world' | 'flange';

export type JogAxis = 'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz';

export type JogResult =
  | { readonly ok: true; readonly joints: readonly number[] }
  | { readonly ok: false; readonly reason: 'unreachable' };

/** «Инструмент вниз» — поворот на 180° вокруг X, ось Z смотрит в стол. */
const TOOL_DOWN = { rx: Math.PI, ry: 0, rz: 0 } as const;

/**
 * Шаг фланца по одной оси. Линейные оси в метрах, угловые в радианах.
 *
 * Неудавшийся шаг не применяется вовсе: углы остаются прежними. Частичного
 * доползания нет — на пульте робот в такой ситуации тоже просто стоит.
 */
export function jogPose(
  chain: KinematicChain,
  joints: readonly number[],
  frame: JogFrame,
  axis: JogAxis,
  delta: number,
): JogResult {
  const current = forwardKinematics(chain, joints);
  const target =
    frame === 'world' ? stepInWorld(current, axis, delta) : stepInFlange(current, axis, delta);

  return reach(chain, poseOf(target), joints);
}

/** Переход в заданную позу целиком: точный ввод числа в панели. */
export function jogToPose(
  chain: KinematicChain,
  joints: readonly number[],
  pose: Pose,
): JogResult {
  return reach(chain, pose, joints);
}

/** Ориентация меняется на «ось Z вниз», точка фланца остаётся на месте. */
export function alignToolDown(chain: KinematicChain, joints: readonly number[]): JogResult {
  const point = translationOf(forwardKinematics(chain, joints));
  return reach(chain, { ...point, ...TOOL_DOWN }, joints);
}

function reach(chain: KinematicChain, target: Pose, seed: readonly number[]): JogResult {
  const solved = solveIk(chain, target, seed);
  return solved.ok ? { ok: true, joints: solved.joints } : { ok: false, reason: 'unreachable' };
}

function stepInWorld(current: Matrix4, axis: JogAxis, delta: number): Matrix4 {
  if (isLinear(axis)) {
    return multiply(fromTranslation(along(axis, delta)), current);
  }

  // Ось поворота проводим через фланец, а не через основание робота: без
  // сопряжения «поверни инструмент» уводило бы руку по дуге через всю зону.
  const point = translationOf(current);
  const spin = fromAxisAngle(along(angular(axis), 1), delta);
  const back = fromTranslation({ x: -point.x, y: -point.y, z: -point.z });

  return multiply(multiply(fromTranslation(point), multiply(spin, back)), current);
}

function stepInFlange(current: Matrix4, axis: JogAxis, delta: number): Matrix4 {
  return isLinear(axis)
    ? multiply(current, fromTranslation(along(axis, delta)))
    : multiply(current, fromAxisAngle(along(angular(axis), 1), delta));
}

function isLinear(axis: JogAxis): axis is 'x' | 'y' | 'z' {
  return axis === 'x' || axis === 'y' || axis === 'z';
}

/** Ось поворота: у `rx` это `x`. */
function angular(axis: 'rx' | 'ry' | 'rz'): 'x' | 'y' | 'z' {
  if (axis === 'rx') return 'x';
  return axis === 'ry' ? 'y' : 'z';
}

function along(axis: 'x' | 'y' | 'z', amount: number): { x: number; y: number; z: number } {
  return {
    x: axis === 'x' ? amount : 0,
    y: axis === 'y' ? amount : 0,
    z: axis === 'z' ? amount : 0,
  };
}
