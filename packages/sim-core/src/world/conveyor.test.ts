import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../tick';
import {
  advanceTick,
  createWorld,
  digitalInput,
  graspObject,
  type Conveyor,
  type SceneObject,
  type Sensor,
} from './state';

/**
 * Лента и датчик — единственное, что двигается на сцене само.
 *
 * Проверяется ровно то, что обещано спекой: равномерное движение, остановка на
 * краю, независимость результата от того, каким размером пачки шли тики.
 */

const PART: SceneObject = {
  id: 'деталь',
  position: { x: 0.35, y: 0.5, z: 0.02 },
  size: { x: 0.04, y: 0.04, z: 0.04 },
};

/** Лента вдоль Y: от 0.6 к 0.2, деталь едет к роботу. */
const BELT: Conveyor = {
  id: 'лента',
  position: { x: 0.35, y: 0.4, z: 0.01 },
  size: { x: 0.12, y: 0.4, z: 0.02 },
  axis: 'y',
  speed: -0.2,
};

/** Датчик в конце ленты: включает первый вход шкафа управления. */
const EYE: Sensor = {
  id: 'датчик',
  position: { x: 0.35, y: 0.22, z: 0.03 },
  size: { x: 0.12, y: 0.04, z: 0.08 },
  bank: 'cabinet',
  channel: 1,
};

function scene(part: SceneObject = PART) {
  return createWorld({
    joints: [0, 0, 0, 0, 0, 0],
    objects: [part],
    conveyors: [BELT],
    sensors: [EYE],
  });
}

/** Сколько метров лента проходит за тик. */
const STEP = Math.abs(BELT.speed) * (TICK_MS / 1000);

describe('лента', () => {
  it('везёт деталь по своей оси', () => {
    const moved = advanceTick(scene());
    expect(moved.objects['деталь']!.position.y).toBeCloseTo(PART.position.y - STEP, 9);
  });

  it('не трогает другие оси', () => {
    const moved = advanceTick(scene());
    const part = moved.objects['деталь']!;

    expect(part.position.x).toBe(PART.position.x);
    expect(part.position.z).toBe(PART.position.z);
  });

  it('за пачку тиков сдвигает ровно на пачку', () => {
    const once = advanceTick(scene(), 20);
    const twenty = [...Array(20)].reduce<ReturnType<typeof scene>>(
      (world) => advanceTick(world),
      scene(),
    );

    expect(once.objects['деталь']!.position.y).toBeCloseTo(
      twenty.objects['деталь']!.position.y,
      9,
    );
  });

  it('не трогает деталь, лежащую в стороне', () => {
    const aside = { ...PART, position: { x: 0.9, y: 0.5, z: 0.02 } };
    const moved = advanceTick(scene(aside));

    expect(moved.objects['деталь']!.position).toEqual(aside.position);
  });

  it('не тянет деталь из захвата', () => {
    const held = graspObject(scene(), 'деталь', { x: 0, y: 0, z: -0.05 });
    const moved = advanceTick(held);

    expect(moved.objects['деталь']!.position).toEqual(PART.position);
  });

  it('оставляет деталь на краю, а не увозит за него', () => {
    // Тиков заведомо больше, чем нужно, чтобы доехать до края ленты.
    const moved = advanceTick(scene(), 10_000);
    // Край ленты по направлению движения: центр минус половина длины.
    expect(moved.objects['деталь']!.position.y).toBeCloseTo(
      BELT.position.y - BELT.size.y / 2,
      9,
    );
  });
});

describe('датчик', () => {
  it('молчит, пока деталь не доехала', () => {
    expect(digitalInput(advanceTick(scene()), 'cabinet', 1)).toBe(false);
  });

  it('включает вход, когда деталь в его коробке', () => {
    const arrived = { ...PART, position: { x: 0.35, y: 0.22, z: 0.02 } };
    expect(digitalInput(advanceTick(scene(arrived), 0), 'cabinet', 1)).toBe(true);
  });

  it('выключает вход, когда деталь уехала дальше', () => {
    const arrived = { ...PART, position: { x: 0.35, y: 0.22, z: 0.02 } };
    const world = advanceTick(scene(arrived), 0);
    expect(digitalInput(world, 'cabinet', 1)).toBe(true);

    // Деталь унесли рукой: датчик не защёлка и должен погаснуть.
    const taken = advanceTick(
      { ...world, objects: { деталь: { ...arrived, position: { x: 0, y: 0, z: 0.5 } } } },
      0,
    );
    expect(digitalInput(taken, 'cabinet', 1)).toBe(false);
  });

  it('срабатывает ровно тогда, когда деталь доехала до его коробки', () => {
    let world = scene();
    let ticks = 0;

    while (!digitalInput(world, 'cabinet', 1) && ticks < 10_000) {
      world = advanceTick(world);
      ticks += 1;
    }

    expect(ticks).toBeLessThan(10_000);
    // Центр детали внутри коробки датчика: 0.22 ± 0.02.
    expect(world.objects['деталь']!.position.y).toBeLessThanOrEqual(0.24);
    expect(world.objects['деталь']!.position.y).toBeGreaterThanOrEqual(0.2);
  });
});
