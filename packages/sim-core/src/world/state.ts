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
import { TICK_MS } from '../tick';
import { isInsideZone } from './aabb';
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

/**
 * Лента конвейера: коробка, ось и скорость в метрах в секунду.
 *
 * Деталь, чей центр внутри коробки и которая не зажата, едет вдоль оси и
 * останавливается на краю ленты — это и есть упор в её конце. Никакой физики:
 * ни трения, ни падения, ни поворота детали (§13 брифа).
 */
export interface Conveyor {
  readonly id: string;
  readonly position: Vec3;
  readonly size: Vec3;
  readonly axis: 'x' | 'y';
  /** Знак задаёт направление вдоль оси. */
  readonly speed: number;
}

/**
 * Датчик присутствия: пока в его коробке есть деталь, вход включён.
 *
 * Фиксации нет — это фотодатчик, а не защёлка, и ведёт он себя так же, как на
 * реальной ячейке. Канал нумеруется с единицы, как в интерфейсе робота.
 */
export interface Sensor {
  readonly id: string;
  readonly position: Vec3;
  readonly size: Vec3;
  readonly bank: IoBank;
  readonly channel: number;
}

export interface WorldState {
  /** Счётчик тиков с начала прогона. Единственный источник времени. */
  readonly tick: number;
  /** Углы суставов в радианах, порядок из конфига плагина. */
  readonly joints: readonly number[];
  readonly objects: Readonly<Record<string, SceneObject>>;
  readonly zones: Readonly<Record<string, Zone>>;
  /** Ленты сцены. За прогон не меняются, но тик берёт их отсюда. */
  readonly conveyors: Readonly<Record<string, Conveyor>>;
  readonly sensors: Readonly<Record<string, Sensor>>;
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
  /**
   * Конец удавшегося движения: где оказался фланец.
   *
   * Нужно автопроверке заданий без детали — «пройди три точки» сверяется именно
   * с этими записями. Промежуточные позы в журнал не идут: у движения по осям
   * они произвольны, и точку можно было бы зацепить случайно.
   */
  | { readonly kind: 'moved'; readonly tick: number; readonly point: Vec3 }
  | { readonly kind: 'collision'; readonly tick: number; readonly objectId: string }
  | { readonly kind: 'error'; readonly tick: number; readonly message: string }
  | { readonly kind: 'finished'; readonly tick: number };

export type EventLog = readonly SimEvent[];

export interface WorldInit {
  readonly joints: readonly number[];
  readonly objects?: readonly SceneObject[];
  readonly zones?: readonly Zone[];
  readonly conveyors?: readonly Conveyor[];
  readonly sensors?: readonly Sensor[];
  /** Число каналов по банкам. По умолчанию как на планшете JAKA. */
  readonly io?: Partial<Record<IoBank, { readonly inputs: number; readonly outputs: number }>>;
}

export function createWorld(init: WorldInit): WorldState {
  return {
    tick: 0,
    joints: [...init.joints],
    objects: byId(init.objects ?? []),
    zones: byId(init.zones ?? []),
    conveyors: byId(init.conveyors ?? []),
    sensors: byId(init.sensors ?? []),
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

/**
 * Шаг времени: единственное место, где на сцене что-то происходит само.
 *
 * Сначала ленты везут детали, потом датчики смотрят, что перед ними оказалось,
 * — иначе вход отставал бы от картинки на тик.
 *
 * Пачка тиков считается одним сдвигом на всю пачку: движение равномерное, и
 * результат совпадает с потиковым. Датчик при этом опрашивается в конце пачки,
 * поэтому деталь, проехавшая мимо него за одно длинное движение робота, может
 * остаться незамеченной. Ожидание сигнала от этого не страдает: `waitDI`
 * двигает время по одному тику.
 */
export function advanceTick(world: WorldState, ticks = 1): WorldState {
  const carried = carryConveyors(world, ticks);
  return readSensors({ ...carried, tick: world.tick + ticks });
}

/** Детали на лентах за `ticks` тиков. Зажатая деталь едет с рукой, а не с лентой. */
function carryConveyors(world: WorldState, ticks: number): WorldState {
  const belts = Object.values(world.conveyors);
  if (belts.length === 0 || ticks === 0) return world;

  let objects = world.objects;

  for (const object of Object.values(world.objects)) {
    if (object.id === world.grasped) continue;

    const belt = belts.find((candidate) => isInsideZone(object, candidate));
    if (belt === undefined) continue;

    const shift = belt.speed * ticks * (TICK_MS / 1000);
    const edge = belt.position[belt.axis] + (Math.sign(belt.speed) * belt.size[belt.axis]) / 2;
    const from = object.position[belt.axis];
    const to = belt.speed > 0 ? Math.min(from + shift, edge) : Math.max(from + shift, edge);

    objects = {
      ...objects,
      [object.id]: { ...object, position: { ...object.position, [belt.axis]: to } },
    };
  }

  return objects === world.objects ? world : { ...world, objects };
}

/** Входы датчиков по тому, что сейчас лежит в их коробках. */
function readSensors(world: WorldState): WorldState {
  const eyes = Object.values(world.sensors);
  if (eyes.length === 0) return world;

  const objects = Object.values(world.objects);

  return eyes.reduce(
    (state, eye) =>
      setDigitalInput(
        state,
        eye.bank,
        eye.channel,
        objects.some((object) => isInsideZone(object, eye)),
      ),
    world,
  );
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

/**
 * Отпускает то, что в захвате. Открыть пустой схват — не ошибка.
 *
 * Отпущенная деталь опускается на ближайшую опору под собой: столешницу или
 * верх другой детали. Это не физика — ни скорости, ни отскока, ни опрокидывания
 * (§13 брифа), — а здравый смысл: деталь, разжатая в сантиметре над ячейкой,
 * висела бы в воздухе, на сцене это выглядит поломкой, а автопроверка честно
 * не засчитывала бы ячейку.
 */
export function releaseObject(world: WorldState): WorldState {
  const released = { ...world, grasped: null, graspOffset: null, gripperOpen: true };
  if (world.grasped === null) return released;

  const object = world.objects[world.grasped];
  if (object === undefined) return released;

  const position = { ...object.position, z: restingHeight(world, object) };
  return { ...released, objects: { ...world.objects, [object.id]: { ...object, position } } };
}

/** Насколько выше опоры может оказаться низ детали и всё равно на неё встать, метры. */
const SUPPORT_TOLERANCE = 0.005;

/**
 * Высота центра детали, вставшей на опору.
 *
 * Опора — столешница (ноль) или верх другой детали, над которым стоит центр
 * отпущенной и который не выше её низа. Так деталь, поставленная на соседнюю,
 * остаётся стоять на ней, а не проваливается на стол.
 */
function restingHeight(world: WorldState, object: SceneObject): number {
  const half = object.size.z / 2;
  const bottom = object.position.z - half;
  let support = 0;

  for (const other of Object.values(world.objects)) {
    if (other.id === object.id) continue;

    const withinX = Math.abs(object.position.x - other.position.x) <= other.size.x / 2;
    const withinY = Math.abs(object.position.y - other.position.y) <= other.size.y / 2;
    if (!withinX || !withinY) continue;

    const top = other.position.z + other.size.z / 2;
    if (top <= bottom + SUPPORT_TOLERANCE && top > support) support = top;
  }

  return support + half;
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
