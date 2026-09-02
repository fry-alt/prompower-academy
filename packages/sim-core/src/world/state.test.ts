import { describe, expect, it } from 'vitest';
import {
  advanceTick,
  createWorld,
  graspObject,
  moveObject,
  releaseObject,
  setDigitalInput,
  setDigitalOutput,
  setJoints,
  setVariable,
  type SceneObject,
  type Zone,
} from './state';

const cube: SceneObject = {
  id: 'cube-1',
  position: { x: 0.3, y: 0.02, z: 0 },
  size: { x: 0.04, y: 0.04, z: 0.04 },
};

const zoneB: Zone = {
  id: 'zone-b',
  position: { x: -0.3, y: 0.01, z: 0 },
  size: { x: 0.15, y: 0.02, z: 0.15 },
};

function world() {
  return createWorld({ joints: [0, 0, 0, 0, 0, 0], objects: [cube], zones: [zoneB] });
}

describe('createWorld', () => {
  it('начинает с нулевого тика и открытого захвата', () => {
    const state = world();
    expect(state.tick).toBe(0);
    expect(state.grasped).toBeNull();
    expect(state.gripperOpen).toBe(true);
  });

  it('раскладывает объекты и зоны по идентификаторам', () => {
    expect(world().objects['cube-1']).toEqual(cube);
    expect(world().zones['zone-b']).toEqual(zoneB);
  });

  it('заводит входы и выходы выключенными', () => {
    const state = createWorld({ joints: [], digitalInputCount: 3, digitalOutputCount: 2 });
    expect(state.digitalInputs).toEqual([false, false, false]);
    expect(state.digitalOutputs).toEqual([false, false]);
  });

  it('отвергает повторяющийся идентификатор', () => {
    expect(() => createWorld({ joints: [], objects: [cube, cube] })).toThrow(/встречается дважды/);
  });
});

describe('неизменяемость', () => {
  it('не трогает исходное состояние', () => {
    const before = world();
    const after = setVariable(before, 'счётчик', 1);

    expect(before.variables).toEqual({});
    expect(after.variables).toEqual({ 'счётчик': 1 });
  });

  it('не делит массив выходов между состояниями', () => {
    const before = world();
    const after = setDigitalOutput(before, 0, true);

    expect(before.digitalOutputs[0]).toBe(false);
    expect(after.digitalOutputs[0]).toBe(true);
  });

  it('не делит объекты между состояниями', () => {
    const before = world();
    const after = moveObject(before, 'cube-1', { x: 0, y: 0, z: 0 });

    expect(before.objects['cube-1']?.position).toEqual(cube.position);
    expect(after.objects['cube-1']?.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('время', () => {
  it('идёт тиками, а не реальными миллисекундами', () => {
    expect(advanceTick(world()).tick).toBe(1);
    expect(advanceTick(world(), 10).tick).toBe(10);
  });
});

describe('захват', () => {
  it('берёт объект и закрывает схват', () => {
    const state = graspObject(world(), 'cube-1');
    expect(state.grasped).toBe('cube-1');
    expect(state.gripperOpen).toBe(false);
  });

  it('отпускает и открывает схват', () => {
    const state = releaseObject(graspObject(world(), 'cube-1'));
    expect(state.grasped).toBeNull();
    expect(state.gripperOpen).toBe(true);
  });

  it('открыть пустой схват не ошибка', () => {
    expect(() => releaseObject(world())).not.toThrow();
  });

  it('отвергает захват несуществующего объекта', () => {
    expect(() => graspObject(world(), 'cube-9')).toThrow(/нет на сцене/);
  });
});

describe('входы и выходы', () => {
  it('переключает канал по номеру', () => {
    expect(setDigitalInput(world(), 2, true).digitalInputs[2]).toBe(true);
  });

  it('отвергает несуществующий канал', () => {
    expect(() => setDigitalOutput(world(), 99, true)).toThrow(/выход 99 не существует/);
    expect(() => setDigitalInput(world(), -1, true)).toThrow(/вход -1 не существует/);
  });
});

describe('суставы', () => {
  it('заменяет позу целиком', () => {
    expect(setJoints(world(), [1, 2, 3, 4, 5, 6]).joints).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
