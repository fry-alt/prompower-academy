import { describe, expect, it } from 'vitest';
import type { Program } from '@prompower/sim-core';
import { countOp, parseTour, TourParseError } from './tour';

/**
 * Сценарий обучения приходит из каталога курсов, то есть извне кода. Разбор
 * проверяет его так же строго, как разбор заданий: ошибка называет путь до
 * места, чтобы автор урока чинил, а не гадал.
 */

const STEP = {
  target: '[data-testid=play]',
  text: 'Запустите программу.',
  done: 'click',
};

describe('parseTour', () => {
  it('разбирает шаг, который закрывается нажатием', () => {
    const tour = parseTour({ steps: [STEP] });

    expect(tour.steps).toHaveLength(1);
    expect(tour.steps[0]).toEqual({
      target: '[data-testid=play]',
      text: 'Запустите программу.',
      done: { kind: 'click' },
    });
  });

  it('разбирает шаг, который закрывается зачётом задания', () => {
    const tour = parseTour({ steps: [{ ...STEP, done: 'passed' }] });
    expect(tour.steps[0]!.done).toEqual({ kind: 'passed' });
  });

  it('разбирает шаг, который ждёт появления блока в программе', () => {
    const tour = parseTour({ steps: [{ ...STEP, done: { op: 'moveL', count: 2 } }] });
    expect(tour.steps[0]!.done).toEqual({ kind: 'programHas', op: 'moveL', count: 2 });
  });

  it('пустой сценарий — ошибка: показывать нечего', () => {
    expect(() => parseTour({ steps: [] })).toThrow(TourParseError);
  });

  it('ошибка называет путь до места', () => {
    expect(() => parseTour({ steps: [{ ...STEP, target: '' }] })).toThrow(/tour\.steps\[0\]\.target/);
  });

  it('неизвестный способ завершения не проходит молча', () => {
    expect(() => parseTour({ steps: [{ ...STEP, done: 'скоро' }] })).toThrow(
      /tour\.steps\[0\]\.done/,
    );
  });

  it('ожидание блока без количества — ошибка', () => {
    expect(() => parseTour({ steps: [{ ...STEP, done: { op: 'moveL' } }] })).toThrow(
      /tour\.steps\[0\]\.done\.count/,
    );
  });
});

describe('countOp', () => {
  const program: Program = {
    version: 1,
    body: [
      { op: 'comment', text: 'начало' },
      { op: 'moveL', pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, speed: 1, acc: 1 },
      {
        op: 'repeat',
        times: 3,
        body: [{ op: 'moveL', pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, speed: 1, acc: 1 }],
      },
      {
        op: 'if',
        cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: true },
        then: [{ op: 'moveL', pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }, speed: 1, acc: 1 }],
        else: [{ op: 'comment', text: 'иначе' }],
      },
    ],
  };

  it('считает инструкции по всему дереву, а не только сверху', () => {
    // Один снаружи, один в цикле, один в ветви: перетащить блок внутрь цикла —
    // тоже перетащить.
    expect(countOp(program, 'moveL')).toBe(3);
  });

  it('считает комментарии в обеих ветвях', () => {
    expect(countOp(program, 'comment')).toBe(2);
  });

  it('чего нет — ноль', () => {
    expect(countOp(program, 'gripper')).toBe(0);
  });
});
