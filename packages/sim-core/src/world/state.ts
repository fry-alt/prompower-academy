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

import { DEFAULT_IO_LAYOUT, ioBankLabel, type IoBank } from '../io';
import type { StatementOp } from '../program/ast';

/**
 * Точка сцены в системе координат основания робота: метры, ось Z вверх.
 *
 * Та же система, что в URDF, — иначе прямая кинематика и положения деталей
 * жили бы в разных мирах. Разворот под ось Y вверх делает только визуализация,
 * на границе с three.js.
 */
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

/**
 * Именованная область стола: в неё кладут деталь и по ней проверяют задание.
 *
 * Деталь считается лежащей в зоне, когда её центр внутри этой коробки. Высоту
 * автор задания задаёт сам: невысокая зона засчитает только положенную деталь,
 * а поднятую над столом — нет.
 */
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
  /**
   * Где зажатая деталь сидит относительно фланца. Благодаря этому она едет
   * вместе с рукой и не прыгает в центр схвата в момент захвата.
   */
  readonly graspOffset: Vec3 | null;
  readonly gripperOpen: boolean;
  /** Каналы шкафа управления и инструмента. Нумерация внутри банка идёт с единицы. */
  readonly io: Readonly<Record<IoBank, IoBankState>>;
  readonly variables: Readonly<Record<string, number>>;
}

export interface IoBankState {
  readonly inputs: readonly boolean[];
  readonly outputs: readonly boolean[];
}

export type SimEvent =
  | { readonly kind: 'statement'; readonly tick: number; readonly op: StatementOp }
  | { readonly kind: 'grasp'; readonly tick: number; readonly objectId: string }
  /** Схват сомкнулся, но детали между губок не было. Нужен автопроверке урока. */
  | { readonly kind: 'graspMissed'; readonly tick: number }
  | { readonly kind: 'release'; readonly tick: number; readonly objectId: string }
  | {
      readonly kind: 'output';
      readonly tick: number;
      readonly bank: IoBank;
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
  /** Число каналов по банкам. По умолчанию как на планшете JAKA. */
  readonly io?: Partial<Record<IoBank, { readonly inputs: number; readonly outputs: number }>>;
}

export function createWorld(init: WorldInit): WorldState {
  return {
    tick: 0,
    joints: [...init.joints],
    objects: byId(init.objects ?? []),
    zones: byId(init.zones ?? []),
    grasped: null,
    graspOffset: null,
    gripperOpen: true,
    io: {
      cabinet: bankState(init.io?.cabinet ?? DEFAULT_IO_LAYOUT.cabinet),
      tool: bankState(init.io?.tool ?? DEFAULT_IO_LAYOUT.tool),
    },
    variables: {},
  };
}

function bankState(layout: { readonly inputs: number; readonly outputs: number }): IoBankState {
  return { inputs: falses(layout.inputs), outputs: falses(layout.outputs) };
}

/** Состояние канала. `null` — такого канала у робота нет. */
export function digitalInput(world: WorldState, bank: IoBank, channel: number): boolean | null {
  return world.io[bank].inputs[channel - 1] ?? null;
}

export function digitalOutput(world: WorldState, bank: IoBank, channel: number): boolean | null {
  return world.io[bank].outputs[channel - 1] ?? null;
}

export function advanceTick(world: WorldState, ticks = 1): WorldState {
  return { ...world, tick: world.tick + ticks };
}

export function setJoints(world: WorldState, joints: readonly number[]): WorldState {
  return { ...world, joints: [...joints] };
}

export function setDigitalOutput(
  world: WorldState,
  bank: IoBank,
  channel: number,
  value: boolean,
): WorldState {
  const outputs = replaceChannel(world.io[bank].outputs, bank, channel, value, 'Выхода');
  return { ...world, io: { ...world.io, [bank]: { ...world.io[bank], outputs } } };
}

export function setDigitalInput(
  world: WorldState,
  bank: IoBank,
  channel: number,
  value: boolean,
): WorldState {
  const inputs = replaceChannel(world.io[bank].inputs, bank, channel, value, 'Входа');
  return { ...world, io: { ...world.io, [bank]: { ...world.io[bank], inputs } } };
}

export function setVariable(world: WorldState, name: string, value: number): WorldState {
  return { ...world, variables: { ...world.variables, [name]: value } };
}

export function moveObject(world: WorldState, id: string, position: Vec3): WorldState {
  const object = world.objects[id];
  if (object === undefined) throw new RangeError(`Объекта «${id}» нет на сцене`);
  return { ...world, objects: { ...world.objects, [id]: { ...object, position } } };
}

/**
 * Берёт объект в захват. Схват при этом закрывается.
 *
 * `offset` — положение детали в системе фланца на момент захвата. По нему деталь
 * потом едет вместе с рукой.
 */
export function graspObject(world: WorldState, id: string, offset: Vec3): WorldState {
  if (world.objects[id] === undefined) throw new RangeError(`Объекта «${id}» нет на сцене`);
  return { ...world, grasped: id, graspOffset: offset, gripperOpen: false };
}

/** Отпускает то, что в захвате. Открыть пустой схват — не ошибка. */
export function releaseObject(world: WorldState): WorldState {
  return { ...world, grasped: null, graspOffset: null, gripperOpen: true };
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

function replaceChannel(
  values: readonly boolean[],
  bank: IoBank,
  channel: number,
  value: boolean,
  what: string,
): boolean[] {
  if (!Number.isInteger(channel) || channel < 1 || channel > values.length) {
    throw new RangeError(
      `${what} ${channel} у ${ioBankLabel(bank)} нет: каналов всего ${values.length}`,
    );
  }
  const next = [...values];
  next[channel - 1] = value;
  return next;
}
