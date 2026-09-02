import type { SceneObject, Zone } from '../world/state';

/**
 * Задание описывается декларативно, рядом с уроком (§6 брифа).
 *
 * Ни одной строчки кода приложения новое задание требовать не должно: автор
 * курса кладёт JSON, и урок появляется. Поэтому цели и ограничения — данные, а
 * не функции.
 */

export type Goal =
  | { readonly type: 'objectInZone'; readonly object: string; readonly zone: string }
  | { readonly type: 'gripperState'; readonly state: 'open' | 'closed' };

export type Constraint = { readonly type: 'maxStatements'; readonly value: number };

/** Подсказка, которая выдаётся после нескольких неудачных попыток. */
export interface Hint {
  readonly afterFailedAttempts: number;
  readonly text: string;
}

export interface TaskWorld {
  readonly objects: readonly SceneObject[];
  readonly zones: readonly Zone[];
  /** Стартовая поза робота. Не задана — берётся домашняя из конфига модели. */
  readonly joints?: readonly number[];
}

export interface Task {
  readonly id: string;
  readonly world: TaskWorld;
  readonly goals: readonly Goal[];
  readonly constraints: readonly Constraint[];
  readonly hints: readonly Hint[];
}

export class TaskParseError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'TaskParseError';
  }
}

/**
 * Разбор задания из JSON.
 *
 * Проверяем явно, а не доверяем типу: файл приходит из репозитория курсов, то
 * есть извне. Ошибка называет путь до места — автору курса чинить, а не гадать.
 */
export function parseTask(input: unknown): Task {
  const root = asRecord(input, 'task');

  return {
    id: asNonEmptyString(root['id'], 'task.id'),
    world: parseWorld(root['world'], 'task.world'),
    goals: asArray(root['goals'], 'task.goals').map((goal, index) =>
      parseGoal(goal, `task.goals[${index}]`),
    ),
    constraints: optionalArray(root['constraints'], 'task.constraints').map((item, index) =>
      parseConstraint(item, `task.constraints[${index}]`),
    ),
    hints: optionalArray(root['hints'], 'task.hints').map((item, index) =>
      parseHint(item, `task.hints[${index}]`),
    ),
  };
}

function parseWorld(input: unknown, path: string): TaskWorld {
  const record = asRecord(input, path);
  const joints = record['joints'];

  const world: TaskWorld = {
    objects: asArray(record['objects'], `${path}.objects`).map((item, index) =>
      parseBox(item, `${path}.objects[${index}]`),
    ),
    zones: optionalArray(record['zones'], `${path}.zones`).map((item, index) =>
      parseBox(item, `${path}.zones[${index}]`),
    ),
  };

  if (joints === undefined) return world;
  return {
    ...world,
    joints: asArray(joints, `${path}.joints`).map((value, index) =>
      asNumber(value, `${path}.joints[${index}]`),
    ),
  };
}

/** Деталь и зона описаны одинаково: идентификатор, центр и габариты. */
function parseBox(input: unknown, path: string): SceneObject {
  const record = asRecord(input, path);
  return {
    id: asNonEmptyString(record['id'], `${path}.id`),
    position: parseVec3(record['position'], `${path}.position`),
    size: parseVec3(record['size'], `${path}.size`),
  };
}

function parseVec3(input: unknown, path: string): { x: number; y: number; z: number } {
  const record = asRecord(input, path);
  return {
    x: asNumber(record['x'], `${path}.x`),
    y: asNumber(record['y'], `${path}.y`),
    z: asNumber(record['z'], `${path}.z`),
  };
}

function parseGoal(input: unknown, path: string): Goal {
  const record = asRecord(input, path);
  const type = asNonEmptyString(record['type'], `${path}.type`);

  switch (type) {
    case 'objectInZone':
      return {
        type,
        object: asNonEmptyString(record['object'], `${path}.object`),
        zone: asNonEmptyString(record['zone'], `${path}.zone`),
      };

    case 'gripperState': {
      const state = asNonEmptyString(record['state'], `${path}.state`);
      if (state !== 'open' && state !== 'closed') {
        throw new TaskParseError(`${path}.state`, `ожидалось open или closed, получено «${state}»`);
      }
      return { type, state };
    }

    default:
      throw new TaskParseError(path, `неизвестная цель «${type}»`);
  }
}

function parseConstraint(input: unknown, path: string): Constraint {
  const record = asRecord(input, path);
  const type = asNonEmptyString(record['type'], `${path}.type`);

  if (type !== 'maxStatements') {
    throw new TaskParseError(path, `неизвестное ограничение «${type}»`);
  }

  const value = asNumber(record['value'], `${path}.value`);
  if (!Number.isInteger(value) || value < 1) {
    throw new TaskParseError(`${path}.value`, `ожидалось целое число больше нуля, получено ${value}`);
  }
  return { type, value };
}

function parseHint(input: unknown, path: string): Hint {
  const record = asRecord(input, path);
  const after = asNumber(record['afterFailedAttempts'], `${path}.afterFailedAttempts`);

  if (!Number.isInteger(after) || after < 1) {
    throw new TaskParseError(
      `${path}.afterFailedAttempts`,
      `ожидалось целое число больше нуля, получено ${after}`,
    );
  }
  return { afterFailedAttempts: after, text: asNonEmptyString(record['text'], `${path}.text`) };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TaskParseError(path, 'ожидался объект');
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new TaskParseError(path, 'ожидался массив');
  return value;
}

function optionalArray(value: unknown, path: string): unknown[] {
  return value === undefined ? [] : asArray(value, path);
}

function asNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new TaskParseError(path, 'ожидалась строка');
  if (value.trim() === '') throw new TaskParseError(path, 'строка пустая');
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TaskParseError(path, 'ожидалось конечное число');
  }
  return value;
}
