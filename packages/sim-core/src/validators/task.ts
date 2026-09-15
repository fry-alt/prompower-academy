import { isIoBank } from '../io';
import type { Conveyor, SceneObject, Sensor, Vec3, Zone } from '../world/state';

/**
 * Задание описывается декларативно, рядом с уроком (§6 брифа).
 *
 * Ни одной строчки кода приложения новое задание требовать не должно: автор
 * курса кладёт JSON, и урок появляется. Поэтому цели и ограничения — данные, а
 * не функции.
 */

export type Goal =
  | { readonly type: 'objectInZone'; readonly object: string; readonly zone: string }
  | { readonly type: 'gripperState'; readonly state: 'open' | 'closed' }
  /**
   * Фланец побывал у каждой из точек. Порядок обхода не проверяется: урок про
   * движение, а не про последовательность.
   */
  | {
      readonly type: 'pointsVisited';
      readonly points: readonly Vec3[];
      /** Насколько близко нужно подойти, метры. */
      readonly tolerance: number;
    };

export type Constraint = { readonly type: 'maxStatements'; readonly value: number };

/** Подсказка, которая выдаётся после нескольких неудачных попыток. */
export interface Hint {
  readonly afterFailedAttempts: number;
  readonly text: string;
}

export interface TaskWorld {
  readonly objects: readonly SceneObject[];
  readonly zones: readonly Zone[];
  /** Ленты сцены: по ним детали приезжают к роботу сами. */
  readonly conveyors: readonly Conveyor[];
  /** Датчики присутствия: держат вход включённым, пока перед ними деталь. */
  readonly sensors: readonly Sensor[];
  /** Стартовая поза робота. Не задана — берётся домашняя из конфига модели. */
  readonly joints?: readonly number[];
}

/** Чем ученик решает задание: программой из блоков или ползунками суставов. */
export type TaskMode = 'program' | 'jog';

export interface Task {
  readonly id: string;
  readonly mode: TaskMode;
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
  const mode = parseMode(root['mode']);

  const constraints = optionalArray(root['constraints'], 'task.constraints').map((item, index) =>
    parseConstraint(item, `task.constraints[${index}]`),
  );

  // Ручное задание решается руками: инструкций нет, и ограничивать в нём нечего.
  // Молча пропустить такое ограничение значит показать ученику требование,
  // которое никогда не проверяется.
  if (mode === 'jog' && constraints.length > 0) {
    throw new TaskParseError(
      'task.constraints',
      'в ручном задании нет программы: ограничивать нечего',
    );
  }

  return {
    id: asNonEmptyString(root['id'], 'task.id'),
    mode,
    world: parseWorld(root['world'], 'task.world'),
    goals: asArray(root['goals'], 'task.goals').map((goal, index) =>
      parseGoal(goal, `task.goals[${index}]`),
    ),
    constraints,
    hints: optionalArray(root['hints'], 'task.hints').map((item, index) =>
      parseHint(item, `task.hints[${index}]`),
    ),
  };
}

/** Режим не указан — задание программное: так написаны все уроки до первого. */
function parseMode(input: unknown): TaskMode {
  if (input === undefined) return 'program';
  if (input === 'program' || input === 'jog') return input;

  throw new TaskParseError('task.mode', `ожидалось program или jog, получено «${String(input)}»`);
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
    conveyors: optionalArray(record['conveyors'], `${path}.conveyors`).map((item, index) =>
      parseConveyor(item, `${path}.conveyors[${index}]`),
    ),
    sensors: optionalArray(record['sensors'], `${path}.sensors`).map((item, index) =>
      parseSensor(item, `${path}.sensors[${index}]`),
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

/** Лента: та же коробка плюс ось движения и скорость в метрах в секунду. */
function parseConveyor(input: unknown, path: string): Conveyor {
  const box = parseBox(input, path);
  const record = asRecord(input, path);
  const axis = asNonEmptyString(record['axis'], `${path}.axis`);

  if (axis !== 'x' && axis !== 'y') {
    throw new TaskParseError(`${path}.axis`, `ожидалось x или y, получено «${axis}»`);
  }

  const speed = asNumber(record['speed'], `${path}.speed`);
  if (speed === 0) {
    throw new TaskParseError(`${path}.speed`, 'лента со скоростью 0 ничего не везёт');
  }

  return { ...box, axis, speed };
}

/** Датчик: коробка плюс канал, который он держит включённым. */
function parseSensor(input: unknown, path: string): Sensor {
  const box = parseBox(input, path);
  const record = asRecord(input, path);
  const bank = record['bank'];

  if (!isIoBank(bank)) {
    throw new TaskParseError(
      `${path}.bank`,
      `ожидалось cabinet или tool, получено «${String(bank)}»`,
    );
  }

  const channel = asNumber(record['channel'], `${path}.channel`);
  if (!Number.isInteger(channel) || channel < 1) {
    throw new TaskParseError(`${path}.channel`, `каналы нумеруются с единицы, получено ${channel}`);
  }

  return { ...box, bank, channel };
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

    case 'pointsVisited': {
      const points = asArray(record['points'], `${path}.points`).map((item, index) =>
        parseVec3(item, `${path}.points[${index}]`),
      );
      if (points.length === 0) {
        throw new TaskParseError(`${path}.points`, 'нужна хотя бы одна точка');
      }

      // Допуск обязателен: подразумевать его молча значит однажды поменять
      // значение и незаметно сломать все уроки, которые на него опирались.
      const tolerance = asNumber(record['tolerance'], `${path}.tolerance`);
      if (tolerance <= 0) {
        throw new TaskParseError(
          `${path}.tolerance`,
          `допуск должен быть больше нуля, получено ${tolerance}`,
        );
      }

      return { type, points, tolerance };
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
