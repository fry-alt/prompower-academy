import { describe, expect, it } from 'vitest';
import { takeGoals } from './goal-ratchet';

describe('takeGoals', () => {
  it('берёт первую цель, когда она достигнута', () => {
    expect(takeGoals([false, false], [true, false])).toEqual([true, false]);
  });

  it('не берёт вторую цель раньше первой', () => {
    expect(takeGoals([false, false], [false, true])).toEqual([false, false]);
  });

  it('берёт вторую, когда первая уже взята', () => {
    expect(takeGoals([true, false], [false, true])).toEqual([true, true]);
  });

  it('взятую цель назад не отдаёт', () => {
    expect(takeGoals([true, false], [false, false])).toEqual([true, false]);
  });

  it('на пустом задании ничего не выдумывает', () => {
    expect(takeGoals([], [])).toEqual([]);
  });
});
