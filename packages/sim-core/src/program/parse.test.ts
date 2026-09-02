import { describe, expect, it } from 'vitest';
import { parseProgram, ProgramParseError } from './parse';

/** Минимальная валидная программа, от которой удобно отталкиваться в тестах. */
function program(body: unknown[]): unknown {
  return { version: 1, body };
}

describe('parseProgram', () => {
  it('разбирает пустую программу', () => {
    expect(parseProgram(program([]))).toEqual({ version: 1, body: [] });
  });

  it('отвергает не тот номер версии', () => {
    expect(() => parseProgram({ version: 2, body: [] })).toThrow(/ожидалась версия 1/);
  });

  it('отвергает не объект', () => {
    expect(() => parseProgram([])).toThrow(/ожидался объект/);
    expect(() => parseProgram(null)).toThrow(/ожидался объект/);
  });

  it('называет путь до места ошибки', () => {
    const nested = program([{ op: 'repeat', times: 2, body: [{ op: 'wait', ms: 'скоро' }] }]);
    expect(() => parseProgram(nested)).toThrow(
      /program\.body\[0\]\.body\[0\]\.ms: ожидалось конечное число/,
    );
  });

  it('отвергает неизвестную команду', () => {
    expect(() => parseProgram(program([{ op: 'moveC' }]))).toThrow(/неизвестная команда «moveC»/);
  });
});

describe('движения', () => {
  const move = { op: 'moveJ', joints: [0, 1, 2, 3, 4, 5], speed: 0.5, acc: 0.5 };

  it('разбирает moveJ', () => {
    expect(parseProgram(program([move]))).toEqual({ version: 1, body: [move] });
  });

  it('требует скорость в долях от максимума', () => {
    expect(() => parseProgram(program([{ ...move, speed: 0 }]))).toThrow(/доля от 0 до 1/);
    expect(() => parseProgram(program([{ ...move, speed: 1.5 }]))).toThrow(/доля от 0 до 1/);
    expect(() => parseProgram(program([{ ...move, speed: 100 }]))).toThrow(/доля от 0 до 1/);
  });

  it('отвергает нечисловой угол сустава', () => {
    const broken = { ...move, joints: [0, 1, Number.NaN, 3, 4, 5] };
    expect(() => parseProgram(program([broken]))).toThrow(/joints\[2\]/);
  });

  it('разбирает moveL со всеми шестью координатами позы', () => {
    const pose = { x: 0.3, y: 0, z: 0.4, rx: 0, ry: Math.PI, rz: 0 };
    const parsed = parseProgram(program([{ op: 'moveL', pose, speed: 1, acc: 1 }]));
    expect(parsed.body[0]).toEqual({ op: 'moveL', pose, speed: 1, acc: 1 });
  });

  it('отвергает позу без ориентации', () => {
    const pose = { x: 0.3, y: 0, z: 0.4 };
    expect(() => parseProgram(program([{ op: 'moveL', pose, speed: 1, acc: 1 }]))).toThrow(
      /pose\.rx/,
    );
  });
});

describe('входы и выходы', () => {
  it('разбирает setDO с банком', () => {
    const statement = { op: 'setDO', bank: 'tool', index: 1, value: true };
    expect(parseProgram(program([statement])).body[0]).toEqual(statement);
  });

  it('требует указать банк', () => {
    expect(() => parseProgram(program([{ op: 'setDO', index: 1, value: true }]))).toThrow(
      /ожидалась строка/,
    );
    const wrong = { op: 'setDO', bank: 'cupboard', index: 1, value: true };
    expect(() => parseProgram(program([wrong]))).toThrow(/ожидалось cabinet или tool/);
  });

  it('нумерует каналы с единицы, как на планшете', () => {
    const zero = { op: 'setDO', bank: 'cabinet', index: 0, value: true };
    expect(() => parseProgram(program([zero]))).toThrow(/номер канала начинается с 1/);
  });

  it('отвергает дробный номер выхода', () => {
    const fraction = { op: 'setDO', bank: 'cabinet', index: 1.5, value: true };
    expect(() => parseProgram(program([fraction]))).toThrow(/номер канала начинается с 1/);
  });

  it('разрешает waitDI без таймаута', () => {
    const statement = { op: 'waitDI', bank: 'cabinet', index: 1, value: true };
    expect(parseProgram(program([statement])).body[0]).toEqual(statement);
  });

  it('разбирает waitDI с таймаутом', () => {
    const statement = { op: 'waitDI', bank: 'cabinet', index: 1, value: true, timeoutMs: 5000 };
    expect(parseProgram(program([statement])).body[0]).toEqual(statement);
  });

  it('отвергает отрицательный таймаут', () => {
    const statement = { op: 'waitDI', bank: 'cabinet', index: 1, value: true, timeoutMs: -1 };
    expect(() => parseProgram(program([statement]))).toThrow(/неотрицательное/);
  });
});

describe('управляющие конструкции', () => {
  it('разбирает вложенные циклы', () => {
    const inner = { op: 'gripper', action: 'close' };
    const parsed = parseProgram(
      program([{ op: 'repeat', times: 3, body: [{ op: 'repeat', times: 2, body: [inner] }] }]),
    );
    expect(parsed.body).toHaveLength(1);
  });

  it('разрешает if без ветки else', () => {
    const statement = {
      op: 'if',
      cond: { kind: 'digitalInput', bank: 'cabinet', index: 1, value: true },
      then: [{ op: 'wait', ms: 100 }],
    };
    expect(parseProgram(program([statement])).body[0]).toEqual(statement);
  });

  it('разбирает составное условие', () => {
    const cond = {
      kind: 'and',
      left: { kind: 'digitalInput', bank: 'tool', index: 1, value: true },
      right: {
        kind: 'not',
        operand: {
          kind: 'compare',
          operator: '<',
          left: { kind: 'variable', name: 'счётчик' },
          right: { kind: 'number', value: 5 },
        },
      },
    };
    const parsed = parseProgram(program([{ op: 'while', cond, body: [] }]));
    expect(parsed.body[0]).toEqual({ op: 'while', cond, body: [] });
  });

  it('отвергает неизвестное условие', () => {
    const statement = { op: 'while', cond: { kind: 'maybe' }, body: [] };
    expect(() => parseProgram(program([statement]))).toThrow(/неизвестное условие «maybe»/);
  });

  it('отвергает неизвестный оператор сравнения', () => {
    const cond = {
      kind: 'compare',
      operator: '=',
      left: { kind: 'number', value: 1 },
      right: { kind: 'number', value: 1 },
    };
    expect(() => parseProgram(program([{ op: 'while', cond, body: [] }]))).toThrow(
      /ожидалось одно из ==/,
    );
  });
});

describe('переменные', () => {
  it('разбирает арифметику', () => {
    const statement = {
      op: 'setVar',
      name: 'счётчик',
      value: {
        kind: 'binary',
        operator: '+',
        left: { kind: 'variable', name: 'счётчик' },
        right: { kind: 'number', value: 1 },
      },
    };
    expect(parseProgram(program([statement])).body[0]).toEqual(statement);
  });

  it('отвергает пустое имя переменной', () => {
    const statement = { op: 'setVar', name: '  ', value: { kind: 'number', value: 1 } };
    expect(() => parseProgram(program([statement]))).toThrow(/имя переменной пустое/);
  });

  it('сообщает путь внутри выражения', () => {
    const statement = {
      op: 'setVar',
      name: 'a',
      value: {
        kind: 'binary',
        operator: '+',
        left: { kind: 'number' },
        right: { kind: 'number', value: 1 },
      },
    };
    expect(() => parseProgram(program([statement]))).toThrow(/value\.left\.value/);
  });
});

describe('ProgramParseError', () => {
  it('несёт путь отдельным полем', () => {
    try {
      parseProgram(program([{ op: 'wait', ms: null }]));
      expect.unreachable('ожидалась ошибка');
    } catch (error) {
      expect(error).toBeInstanceOf(ProgramParseError);
      expect((error as ProgramParseError).path).toBe('program.body[0].ms');
    }
  });
});
