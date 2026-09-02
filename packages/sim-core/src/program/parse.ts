import { isIoBank, type IoBank } from '../io';
import {
  PROGRAM_VERSION,
  type BinaryOperator,
  type CompareOperator,
  type Condition,
  type Expression,
  type GripperAction,
  type Pose,
  type Program,
  type Statement,
} from './ast';

/**
 * Разбор программы из недоверенных данных.
 *
 * Программа приходит из редактора блоков и из базы — оба источника внешние, и
 * `as Program` тут был бы обманом. Разбор явный, с путём до места ошибки:
 * «body[2].body[0].joints[3]» отлаживается, а «invalid program» — нет.
 *
 * Зависимостей у модуля нет намеренно: `sim-core` должен запускаться где угодно,
 * включая CI без браузера.
 */

export class ProgramParseError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`${path}: ${reason}`);
    this.name = 'ProgramParseError';
  }
}

const BINARY_OPERATORS: readonly BinaryOperator[] = ['+', '-', '*', '/'];
const COMPARE_OPERATORS: readonly CompareOperator[] = ['==', '!=', '<', '<=', '>', '>='];
const GRIPPER_ACTIONS: readonly GripperAction[] = ['open', 'close'];

export function parseProgram(input: unknown): Program {
  const record = asRecord(input, 'program');

  if (record['version'] !== PROGRAM_VERSION) {
    throw new ProgramParseError(
      'program.version',
      `ожидалась версия ${PROGRAM_VERSION}, получено ${JSON.stringify(record['version'])}`,
    );
  }

  return { version: PROGRAM_VERSION, body: parseBody(record['body'], 'program.body') };
}

function parseBody(input: unknown, path: string): Statement[] {
  return asArray(input, path).map((item, index) => parseStatement(item, `${path}[${index}]`));
}

function parseStatement(input: unknown, path: string): Statement {
  const record = asRecord(input, path);
  const id = record['id'];
  // Идентификатор блока Blockly необязателен: задания и тесты обходятся без него.
  const meta = id === undefined ? {} : { id: asString(id, `${path}.id`) };
  return { ...meta, ...parseCommand(record, path) };
}

function parseCommand(record: Record<string, unknown>, path: string): Statement {
  const op = asString(record['op'], `${path}.op`);

  switch (op) {
    case 'moveJ':
      return {
        op,
        joints: asNumberArray(record['joints'], `${path}.joints`),
        ...parseMotionParams(record, path),
      };

    case 'moveL':
      return {
        op,
        pose: parsePose(record['pose'], `${path}.pose`),
        ...parseMotionParams(record, path),
      };

    case 'setDO':
      return {
        op,
        bank: asIoBank(record['bank'], `${path}.bank`),
        index: asChannel(record['index'], `${path}.index`),
        value: asBoolean(record['value'], `${path}.value`),
      };

    case 'waitDI': {
      const timeoutMs = record['timeoutMs'];
      const base = {
        op,
        bank: asIoBank(record['bank'], `${path}.bank`),
        index: asChannel(record['index'], `${path}.index`),
        value: asBoolean(record['value'], `${path}.value`),
      } as const;
      // Поле необязательное: ожидание без таймаута — законный случай.
      return timeoutMs === undefined
        ? base
        : { ...base, timeoutMs: asNonNegative(timeoutMs, `${path}.timeoutMs`) };
    }

    case 'gripper':
      return { op, action: oneOf(record['action'], GRIPPER_ACTIONS, `${path}.action`) };

    case 'wait':
      return { op, ms: asNonNegative(record['ms'], `${path}.ms`) };

    case 'repeat':
      return {
        op,
        times: asIndex(record['times'], `${path}.times`),
        body: parseBody(record['body'], `${path}.body`),
      };

    case 'while':
      return {
        op,
        cond: parseCondition(record['cond'], `${path}.cond`),
        body: parseBody(record['body'], `${path}.body`),
      };

    case 'if': {
      const otherwise = record['else'];
      const base = {
        op,
        cond: parseCondition(record['cond'], `${path}.cond`),
        then: parseBody(record['then'], `${path}.then`),
      } as const;
      return otherwise === undefined
        ? base
        : { ...base, else: parseBody(otherwise, `${path}.else`) };
    }

    case 'setVar':
      return {
        op,
        name: asVariableName(record['name'], `${path}.name`),
        value: parseExpression(record['value'], `${path}.value`),
      };

    case 'comment':
      return { op, text: asString(record['text'], `${path}.text`) };

    default:
      throw new ProgramParseError(`${path}.op`, `неизвестная команда «${op}»`);
  }
}

function parseMotionParams(record: Record<string, unknown>, path: string): {
  speed: number;
  acc: number;
} {
  return {
    speed: asFraction(record['speed'], `${path}.speed`),
    acc: asFraction(record['acc'], `${path}.acc`),
  };
}

function parsePose(input: unknown, path: string): Pose {
  const record = asRecord(input, path);
  return {
    x: asNumber(record['x'], `${path}.x`),
    y: asNumber(record['y'], `${path}.y`),
    z: asNumber(record['z'], `${path}.z`),
    rx: asNumber(record['rx'], `${path}.rx`),
    ry: asNumber(record['ry'], `${path}.ry`),
    rz: asNumber(record['rz'], `${path}.rz`),
  };
}

function parseExpression(input: unknown, path: string): Expression {
  const record = asRecord(input, path);
  const kind = asString(record['kind'], `${path}.kind`);

  switch (kind) {
    case 'number':
      return { kind, value: asNumber(record['value'], `${path}.value`) };
    case 'variable':
      return { kind, name: asVariableName(record['name'], `${path}.name`) };
    case 'binary':
      return {
        kind,
        operator: oneOf(record['operator'], BINARY_OPERATORS, `${path}.operator`),
        left: parseExpression(record['left'], `${path}.left`),
        right: parseExpression(record['right'], `${path}.right`),
      };
    default:
      throw new ProgramParseError(`${path}.kind`, `неизвестное выражение «${kind}»`);
  }
}

function parseCondition(input: unknown, path: string): Condition {
  const record = asRecord(input, path);
  const kind = asString(record['kind'], `${path}.kind`);

  switch (kind) {
    case 'compare':
      return {
        kind,
        operator: oneOf(record['operator'], COMPARE_OPERATORS, `${path}.operator`),
        left: parseExpression(record['left'], `${path}.left`),
        right: parseExpression(record['right'], `${path}.right`),
      };
    case 'digitalInput':
      return {
        kind,
        bank: asIoBank(record['bank'], `${path}.bank`),
        index: asChannel(record['index'], `${path}.index`),
        value: asBoolean(record['value'], `${path}.value`),
      };
    case 'not':
      return { kind, operand: parseCondition(record['operand'], `${path}.operand`) };
    case 'and':
    case 'or':
      return {
        kind,
        left: parseCondition(record['left'], `${path}.left`),
        right: parseCondition(record['right'], `${path}.right`),
      };
    default:
      throw new ProgramParseError(`${path}.kind`, `неизвестное условие «${kind}»`);
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProgramParseError(path, `ожидался объект, получено ${describe(value)}`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProgramParseError(path, `ожидался список, получено ${describe(value)}`);
  }
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ProgramParseError(path, `ожидалось конечное число, получено ${describe(value)}`);
  }
  return value;
}

function asNumberArray(value: unknown, path: string): number[] {
  return asArray(value, path).map((item, index) => asNumber(item, `${path}[${index}]`));
}

function asNonNegative(value: unknown, path: string): number {
  const number = asNumber(value, path);
  if (number < 0) throw new ProgramParseError(path, `ожидалось неотрицательное число, получено ${number}`);
  return number;
}

/** Доля от паспортного максимума робота: скорость и ускорение задаются так везде. */
function asFraction(value: unknown, path: string): number {
  const number = asNumber(value, path);
  if (number <= 0 || number > 1) {
    throw new ProgramParseError(path, `ожидалась доля от 0 до 1, получено ${number}`);
  }
  return number;
}

function asIoBank(value: unknown, path: string): IoBank {
  const bank = asString(value, path);
  if (!isIoBank(bank)) {
    throw new ProgramParseError(path, `ожидалось cabinet или tool, получено «${bank}»`);
  }
  return bank;
}

/** Каналы ввода-вывода нумеруются с единицы — так же, как на планшете. */
function asChannel(value: unknown, path: string): number {
  const number = asNumber(value, path);
  if (!Number.isInteger(number) || number < 1) {
    throw new ProgramParseError(path, `номер канала начинается с 1, получено ${number}`);
  }
  return number;
}

function asIndex(value: unknown, path: string): number {
  const number = asNumber(value, path);
  if (!Number.isInteger(number) || number < 0) {
    throw new ProgramParseError(path, `ожидалось целое неотрицательное число, получено ${number}`);
  }
  return number;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ProgramParseError(path, `ожидалось true или false, получено ${describe(value)}`);
  }
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new ProgramParseError(path, `ожидалась строка, получено ${describe(value)}`);
  }
  return value;
}

function asVariableName(value: unknown, path: string): string {
  const name = asString(value, path);
  if (name.trim() === '') throw new ProgramParseError(path, 'имя переменной пустое');
  return name;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  const text = asString(value, path);
  const match = options.find((option) => option === text);
  if (match === undefined) {
    throw new ProgramParseError(path, `ожидалось одно из ${options.join(', ')}, получено «${text}»`);
  }
  return match;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'список';
  return typeof value;
}
