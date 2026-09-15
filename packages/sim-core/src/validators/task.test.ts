import { describe, expect, it } from 'vitest';
import { parseTask, TaskParseError } from './task';

const MINIMAL = {
  id: 'проба',
  world: { objects: [] },
  goals: [{ type: 'gripperState', state: 'open' }],
};

describe('режим задания', () => {
  it('по умолчанию задание решается программой', () => {
    expect(parseTask(MINIMAL).mode).toBe('program');
  });

  it('ручной режим объявляется полем', () => {
    expect(parseTask({ ...MINIMAL, mode: 'jog' }).mode).toBe('jog');
  });

  it('незнакомый режим отвергается с указанием места', () => {
    expect(() => parseTask({ ...MINIMAL, mode: 'blockly' })).toThrow(TaskParseError);
    expect(() => parseTask({ ...MINIMAL, mode: 'blockly' })).toThrow(/task\.mode/);
  });

  it('ограничение на размер программы в ручном задании — ошибка содержания', () => {
    expect(() =>
      parseTask({ ...MINIMAL, mode: 'jog', constraints: [{ type: 'maxStatements', value: 5 }] }),
    ).toThrow(/ограничивать нечего/);
  });

  it('в программном задании то же ограничение разбирается как прежде', () => {
    const task = parseTask({ ...MINIMAL, constraints: [{ type: 'maxStatements', value: 5 }] });
    expect(task.constraints).toEqual([{ type: 'maxStatements', value: 5 }]);
  });
});

describe('цель «поза суставов»', () => {
  const goal = { type: 'jointsAtPose', joints: [0, 1.5, 0, 0, 0, 0], tolerance: 0.05 };

  it('разбирается', () => {
    expect(parseTask({ ...MINIMAL, goals: [goal] }).goals[0]).toEqual(goal);
  });

  it('поза без суставов ничего не задаёт', () => {
    expect(() => parseTask({ ...MINIMAL, goals: [{ ...goal, joints: [] }] })).toThrow(
      /поза без суставов/,
    );
  });

  it('допуск обязателен', () => {
    expect(() => parseTask({ ...MINIMAL, goals: [{ type: 'jointsAtPose', joints: [0] }] })).toThrow(
      /task\.goals\[0\]\.tolerance/,
    );
  });

  it('нулевой допуск недостижим и потому отвергается', () => {
    expect(() => parseTask({ ...MINIMAL, goals: [{ ...goal, tolerance: 0 }] })).toThrow(
      /больше нуля/,
    );
  });
});
