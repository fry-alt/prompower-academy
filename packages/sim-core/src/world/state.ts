/**
 * Состояние сцены и журнал событий.
 *
 * Состояние неизменяемое: каждый шаг интерпретатора возвращает новое. Это даёт
 * бесплатно перемотку и сравнение с эталоном, а тесты избавляет от разбирательств,
 * кто и когда что мутировал.
 *
 * Время здесь — счётчик тиков, а не миллисекунды реального времени. При одном и
 * том же дереве и одном и том же начальном состоянии результат обязан совпадать
 * бит в бит (§6 брифа), а `Date.now()` это ломает.
 */

import type { StatementOp } from '../program/ast';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Объект сцены. Форма — только ограничивающий параллелепипед, точнее не моделируем. */
export interface SceneObject {
  readonly id: string;
  /** Центр объекта в системе координат сцены, метры. */
  readonly position: Vec3;
  /** Габариты по осям, метры. */
  readonly size: Vec3;
}

/** Именованная область стола: в неё кладут деталь и по ней проверяют задание. */
export interface Zone {
  readonly id: string;
  readonly position: Vec3;
  readonly size: Vec3;
}

export interface WorldState {
  /** Счётчик тиков с начала прогона. Единственный источник времени. */
  readonly tick: number;
  /** Углы суставов в радианах, порядок из конфига плагина. */
  readonly joints: readonly number[];
  readonly objects: Readonly<Record<string, SceneObject>>;
  readonly zones: Readonly<Record<string, Zone>>;
  /** Идентификатор объекта в захвате либо `null`. */
  readonly grasped: string | null;
  readonly gripperOpen: boolean;
  readonly digitalInputs: readonly boolean[];
  readonly digitalOutputs: readonly boolean[];
  readonly variables: Readonly<Record<string, number>>;
}

export type SimEvent =
  | { readonly kind: 'statement'; readonly tick: number; readonly op: StatementOp }
  | { readonly kind: 'grasp'; readonly tick: number; readonly objectId: string }
  | { readonly kind: 'release'; readonly tick: number; readonly objectId: string }
  | {
      readonly kind: 'output';
      readonly tick: number;
      readonly index: number;
      readonly value: boolean;
    }
  | {
      readonly kind: 'variable';
      readonly tick: number;
      readonly name: string;
      readonly value: number;
    }
  | { readonly kind: 'collision'; readonly tick: number; readonly objectId: string }
  | { readonly kind: 'error'; readonly tick: number; readonly message: string }
  | { readonly kind: 'finished'; readonly tick: number };

export type EventLog = readonly SimEvent[];

export interface WorldInit {
  readonly joints: readonly number[];
  readonly objects?: readonly SceneObject[];
  readonly zones?: readonly Zone[];
  readonly digitalInputCount?: number;
  readonly digitalOutputCount?: number;
}

const DEFAULT_IO_COUNT = 8;

export function createWorld(init: WorldInit): WorldState {
  return {
    tick: 0,
    joints: [...init.joints],
    objects: byId(init.objects ?? []),
    zones: byId(init.zones ?? []),
    grasped: null,
    gripperOpen: true,
    digitalInputs: falses(init.digitalInputCount ?? DEFAULT_IO_COUNT),
    digitalOutputs: falses(init.digitalOutputCount ?? DEFAULT_IO_COUNT),
    variables: {},
  };
}

export function advanceTick(world: WorldState, ticks = 1): WorldState {
  return { ...world, tick: world.tick + ticks };
}

export function setJoints(world: WorldState, joints: readonly number[]): WorldState {
  return { ...world, joints: [...joints] };
}

export function setDigitalOutput(world: WorldState, index: number, value: boolean): WorldState {
  return { ...world, digitalOutputs: replaceAt(world.digitalOutputs, index, value, 'выход') };
}

export function setDigitalInput(world: WorldState, index: number, value: boolean): WorldState {
  return { ...world, digitalInputs: replaceAt(world.digitalInputs, index, value, 'вход') };
}

export function setVariable(world: WorldState, name: string, value: number): WorldState {
  return { ...world, variables: { ...world.variables, [name]: value } };
}

export function moveObject(world: WorldState, id: string, position: Vec3): WorldState {
  const object = world.objects[id];
  if (object === undefined) throw new RangeError(`Объекта «${id}» нет на сцене`);
  return { ...world, objects: { ...world.objects, [id]: { ...object, position } } };
}

/** Берёт объект в захват. Схват при этом закрывается. */
export function graspObject(world: WorldState, id: string): WorldState {
  if (world.objects[id] === undefined) throw new RangeError(`Объекта «${id}» нет на сцене`);
  return { ...world, grasped: id, gripperOpen: false };
}

/** Отпускает то, что в захвате. Открыть пустой схват — не ошибка. */
export function releaseObject(world: WorldState): WorldState {
  return { ...world, grasped: null, gripperOpen: true };
}

function byId<T extends { readonly id: string }>(items: readonly T[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of items) {
    if (item.id in result) throw new RangeError(`Идентификатор «${item.id}» встречается дважды`);
    result[item.id] = item;
  }
  return result;
}

function falses(count: number): boolean[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`Число каналов ввода-вывода должно быть целым, получено ${count}`);
  }
  return Array.from({ length: count }, () => false);
}

function replaceAt(
  values: readonly boolean[],
  index: number,
  value: boolean,
  what: string,
): boolean[] {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) {
    throw new RangeError(`Цифровой ${what} ${index} не существует: их всего ${values.length}`);
  }
  const next = [...values];
  next[index] = value;
  return next;
}
