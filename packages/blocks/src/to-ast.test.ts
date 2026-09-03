import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from './blocks';
import { BlockTranslationError, toAst, type BlockLike } from './to-ast';

/**
 * Макет блока Blockly: генератору нужны только тип, поля и связи, поэтому
 * поднимать редактор ради теста незачем.
 */
function block(
  type: string,
  fields: Record<string, unknown> = {},
  inputs: Record<string, BlockLike | null> = {},
  next: BlockLike | null = null,
): BlockLike {
  return {
    type,
    getFieldValue: (name) => fields[name],
    getInputTargetBlock: (name) => inputs[name] ?? null,
    getNextBlock: () => next,
  };
}

describe('движения', () => {
  it('переводит градусы в радианы', () => {
    const program = toAst(
      block(BLOCK_TYPES.moveJoint, { J1: 90, J2: 0, J3: -45, J4: 0, J5: 0, J6: 180 }),
    );

    const statement = program.body[0]!;
    expect(statement.op).toBe('moveJ');
    if (statement.op !== 'moveJ') return;
    expect(statement.joints[0]).toBeCloseTo(Math.PI / 2, 9);
    expect(statement.joints[2]).toBeCloseTo(-Math.PI / 4, 9);
    expect(statement.joints[5]).toBeCloseTo(Math.PI, 9);
  });

  it('переводит миллиметры в метры', () => {
    const program = toAst(
      block(BLOCK_TYPES.moveLinear, { X: 350, Y: -200, Z: 60, RX: 180, RY: 0, RZ: 0 }),
    );

    const statement = program.body[0]!;
    expect(statement.op).toBe('moveL');
    if (statement.op !== 'moveL') return;
    expect(statement.pose.x).toBeCloseTo(0.35, 9);
    expect(statement.pose.y).toBeCloseTo(-0.2, 9);
    expect(statement.pose.z).toBeCloseTo(0.06, 9);
  });

  it('берёт ориентацию из полей блока, а не из константы', () => {
    const program = toAst(
      block(BLOCK_TYPES.moveLinear, { X: 0, Y: 0, Z: 100, RX: 90, RY: -45, RZ: 30 }),
    );

    const statement = program.body[0]!;
    expect(statement.op).toBe('moveL');
    if (statement.op !== 'moveL') return;
    expect(statement.pose.rx).toBeCloseTo(Math.PI / 2, 9);
    expect(statement.pose.ry).toBeCloseTo(-Math.PI / 4, 9);
    expect(statement.pose.rz).toBeCloseTo(Math.PI / 6, 9);
  });
});

describe('скорость', () => {
  it('блок скорости сам инструкцией не становится', () => {
    const program = toAst(block(BLOCK_TYPES.setSpeed, { PERCENT: 30 }));
    expect(program.body).toEqual([]);
  });

  it('действует на движения ниже, как общая скорость на планшете', () => {
    const move = block(BLOCK_TYPES.moveLinear, { X: 0, Y: 0, Z: 100, RX: 180, RY: 0, RZ: 0 });
    const program = toAst(block(BLOCK_TYPES.setSpeed, { PERCENT: 30 }, {}, move));

    const statement = program.body[0]!;
    if (statement.op !== 'moveL') throw new Error('ожидалось moveL');
    expect(statement.speed).toBeCloseTo(0.3, 9);
  });

  it('до блока скорости действует значение по умолчанию', () => {
    const program = toAst(block(BLOCK_TYPES.moveLinear, { X: 0, Y: 0, Z: 100, RX: 180, RY: 0, RZ: 0 }));
    const statement = program.body[0]!;
    if (statement.op !== 'moveL') throw new Error('ожидалось moveL');
    expect(statement.speed).toBeCloseTo(0.5, 9);
  });

  it('зажимает нелепые значения', () => {
    const move = block(BLOCK_TYPES.moveLinear, { X: 0, Y: 0, Z: 100, RX: 180, RY: 0, RZ: 0 });
    const program = toAst(block(BLOCK_TYPES.setSpeed, { PERCENT: 900 }, {}, move));

    const statement = program.body[0]!;
    if (statement.op !== 'moveL') throw new Error('ожидалось moveL');
    expect(statement.speed).toBe(1);
  });
});

describe('ввод-вывод и захват', () => {
  it('читает банк и состояние', () => {
    const program = toAst(
      block(BLOCK_TYPES.setOutput, { BANK: 'tool', INDEX: 2, STATE: 'on' }),
    );
    expect(program.body[0]).toEqual({ op: 'setDO', bank: 'tool', index: 2, value: true });
  });

  it('по умолчанию берёт банк шкафа', () => {
    const program = toAst(block(BLOCK_TYPES.setOutput, { INDEX: 1, STATE: 'off' }));
    expect(program.body[0]).toEqual({ op: 'setDO', bank: 'cabinet', index: 1, value: false });
  });

  it('отвергает нулевой номер канала', () => {
    expect(() =>
      toAst(block(BLOCK_TYPES.setOutput, { BANK: 'cabinet', INDEX: 0, STATE: 'on' })),
    ).toThrow(/номер канала начинается с 1/);
  });

  it('захват даёт понятную операцию', () => {
    expect(toAst(block(BLOCK_TYPES.gripper, { ACTION: 'open' })).body[0]).toEqual({
      op: 'gripper',
      action: 'open',
    });
  });
});

describe('последовательности и вложенность', () => {
  it('идёт по цепочке блоков', () => {
    const third = block(BLOCK_TYPES.comment, { TEXT: 'три' });
    const second = block(BLOCK_TYPES.gripper, { ACTION: 'close' }, {}, third);
    const first = block(BLOCK_TYPES.wait, { SECONDS: 1 }, {}, second);

    expect(toAst(first).body.map((s) => s.op)).toEqual(['wait', 'gripper', 'comment']);
  });

  it('разворачивает тело цикла', () => {
    const body = block(BLOCK_TYPES.gripper, { ACTION: 'close' });
    const loop = block(BLOCK_TYPES.repeat, { TIMES: 4 }, { BODY: body });

    const statement = toAst(loop).body[0]!;
    expect(statement.op).toBe('repeat');
    if (statement.op !== 'repeat') return;
    expect(statement.times).toBe(4);
    expect(statement.body).toHaveLength(1);
  });

  it('пустое тело цикла — не ошибка', () => {
    const statement = toAst(block(BLOCK_TYPES.repeat, { TIMES: 2 })).body[0]!;
    if (statement.op !== 'repeat') throw new Error('ожидался repeat');
    expect(statement.body).toEqual([]);
  });

  it('секунды переводятся в миллисекунды', () => {
    expect(toAst(block(BLOCK_TYPES.wait, { SECONDS: 1.5 })).body[0]).toEqual({
      op: 'wait',
      ms: 1500,
    });
  });
});

describe('условия', () => {
  it('собирает условие из блока входа', () => {
    const cond = block(BLOCK_TYPES.inputIs, { BANK: 'cabinet', INDEX: 3, STATE: 'on' });
    const statement = toAst(block(BLOCK_TYPES.branch, {}, { COND: cond })).body[0]!;

    if (statement.op !== 'if') throw new Error('ожидался if');
    expect(statement.cond).toEqual({
      kind: 'digitalInput',
      bank: 'cabinet',
      index: 3,
      value: true,
    });
  });

  it('пустой разъём условия не ломает программу', () => {
    // Наполовину собранная программа — норма, а не поломка: ученик должен
    // увидеть, что ветка не сработала, а не непонятную ошибку.
    const statement = toAst(block(BLOCK_TYPES.branch, {})).body[0]!;

    if (statement.op !== 'if') throw new Error('ожидался if');
    expect(statement.cond).toEqual({
      kind: 'compare',
      operator: '==',
      left: { kind: 'number', value: 0 },
      right: { kind: 'number', value: 1 },
    });
  });

  it('в разъём условия нельзя вставить команду', () => {
    const wrong = block(BLOCK_TYPES.gripper, { ACTION: 'open' });
    expect(() => toAst(block(BLOCK_TYPES.branch, {}, { COND: wrong }))).toThrow(
      BlockTranslationError,
    );
  });
});

describe('крайние случаи', () => {
  it('пустой холст даёт пустую программу', () => {
    expect(toAst(null)).toEqual({ version: 1, body: [] });
  });

  it('незнакомый блок называет себя в ошибке', () => {
    expect(() => toAst(block('чужой_блок'))).toThrow(/чужой_блок/);
  });
});
