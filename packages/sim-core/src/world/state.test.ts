import { describe, expect, it } from 'vitest';
import {
  advanceTick,
  createWorld,
  digitalInput,
  digitalOutput,
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

  it('заводит каналы обоих банков выключенными', () => {
    const state = world();
    // Числа по умолчанию взяты с экрана ввода-вывода планшета JAKA.
    expect(state.io.cabinet.inputs).toHaveLength(10);
    expect(state.io.cabinet.outputs).toHaveLength(8);
    expect(state.io.tool.inputs).toHaveLength(2);
    expect(state.io.tool.outputs).toHaveLength(2);
    expect(state.io.cabinet.outputs.every((value) => value === false)).toBe(true);
  });

  it('позволяет задать своё число каналов', () => {
    const state = createWorld({ joints: [], io: { tool: { inputs: 1, outputs: 1 } } });
    expect(state.io.tool.inputs).toHaveLength(1);
    // Банк, который не переопределяли, остаётся по умолчанию.
    expect(state.io.cabinet.outputs).toHaveLength(8);
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

  it('не делит каналы между состояниями', () => {
    const before = world();
    const after = setDigitalOutput(before, 'cabinet', 1, true);

    expect(digitalOutput(before, 'cabinet', 1)).toBe(false);
    expect(digitalOutput(after, 'cabinet', 1)).toBe(true);
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
  it('нумерует каналы с единицы, как на планшете', () => {
    const state = setDigitalInput(world(), 'cabinet', 1, true);
    expect(digitalInput(state, 'cabinet', 1)).toBe(true);
    expect(digitalInput(state, 'cabinet', 2)).toBe(false);
  });

  it('держит банки шкафа и инструмента раздельно', () => {
    const state = setDigitalOutput(world(), 'tool', 1, true);
    expect(digitalOutput(state, 'tool', 1)).toBe(true);
    expect(digitalOutput(state, 'cabinet', 1)).toBe(false);
  });

  it('отвергает несуществующий канал с указанием банка', () => {
    expect(() => setDigitalOutput(world(), 'tool', 5, true)).toThrow(
      /Выхода 5 у инструмента нет: каналов всего 2/,
    );
    expect(() => setDigitalInput(world(), 'cabinet', 0, true)).toThrow(
      /Входа 0 у шкафа управления нет/,
    );
  });

  it('сообщает про несуществующий канал при чтении', () => {
    expect(digitalInput(world(), 'tool', 9)).toBeNull();
  });
});

describe('суставы', () => {
  it('заменяет позу целиком', () => {
    expect(setJoints(world(), [1, 2, 3, 4, 5, 6]).joints).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
