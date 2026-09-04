import type { Condition, IoBank, Program, Statement } from '@prompower/sim-core';
import { BLOCK_TYPES, MOVE_JOINT_FIELDS } from './blocks';

/**
 * Дерево блоков в AST.
 *
 * Blockly работает в градусах и миллиметрах — так же, как планшет JAKA. Ядро
 * живёт в радианах и метрах, как URDF. Перевод происходит ровно здесь, на
 * границе, и больше нигде.
 *
 * Функция не зависит от классов Blockly: ей достаточно того, что у блока можно
 * спросить тип, поле, вложенный блок и следующий. Благодаря этому генератор
 * проверяется тестами без запуска редактора и без браузера.
 */

/** То, что нужно от блока Blockly. Реальный `Blockly.Block` этому удовлетворяет. */
export interface BlockLike {
  readonly type: string;
  getFieldValue(name: string): unknown;
  getInputTargetBlock(name: string): BlockLike | null;
  getNextBlock(): BlockLike | null;
}

export class BlockTranslationError extends Error {
  constructor(
    readonly blockType: string,
    message: string,
  ) {
    super(`Блок «${blockType}»: ${message}`);
    this.name = 'BlockTranslationError';
  }
}

const DEG_TO_RAD = Math.PI / 180;
const MM = 1000;

/** Ускорение блоками не задаётся: на планшете его тоже нет у движений. */
const DEFAULT_ACC = 0.5;

/** Скорость по умолчанию, пока в программе не встретился блок «скорость». */
const DEFAULT_SPEED = 0.5;

interface Context {
  /** Текущая скорость, доля от паспортной. Меняется блоком «скорость». */
  speed: number;
}

export function toAst(top: BlockLike | null): Program {
  const context: Context = { speed: DEFAULT_SPEED };
  return { version: 1, body: sequence(top, context) };
}

function sequence(first: BlockLike | null, context: Context): Statement[] {
  const body: Statement[] = [];

  for (let block = first; block !== null; block = block.getNextBlock()) {
    const statement = translate(block, context);
    if (statement !== null) body.push(statement);
  }

  return body;
}

/** `null` — блок влияет на контекст, но собственной инструкции не даёт. */
function translate(block: BlockLike, context: Context): Statement | null {
  switch (block.type) {
    case BLOCK_TYPES.setSpeed:
      context.speed = clampSpeed(number(block, 'PERCENT') / 100);
      return null;

    case BLOCK_TYPES.moveJoint:
      return {
        op: 'moveJ',
        joints: MOVE_JOINT_FIELDS.map((field) => number(block, field) * DEG_TO_RAD),
        speed: context.speed,
        acc: DEFAULT_ACC,
      };

    case BLOCK_TYPES.moveLinear:
      return {
        op: 'moveL',
        pose: {
          x: number(block, 'X') / MM,
          y: number(block, 'Y') / MM,
          z: number(block, 'Z') / MM,
          rx: number(block, 'RX') * DEG_TO_RAD,
          ry: number(block, 'RY') * DEG_TO_RAD,
          rz: number(block, 'RZ') * DEG_TO_RAD,
        },
        speed: context.speed,
        acc: DEFAULT_ACC,
      };

    case BLOCK_TYPES.gripper:
      return { op: 'gripper', action: action(block) };

    case BLOCK_TYPES.setOutput:
      return {
        op: 'setDO',
        bank: bank(block),
        index: channel(block),
        value: state(block),
      };

    case BLOCK_TYPES.waitInput:
      return {
        op: 'waitDI',
        bank: bank(block),
        index: channel(block),
        value: state(block),
      };

    case BLOCK_TYPES.wait:
      return { op: 'wait', ms: Math.round(number(block, 'SECONDS') * 1000) };

    case BLOCK_TYPES.repeat:
      return {
        op: 'repeat',
        times: Math.max(0, Math.round(number(block, 'TIMES'))),
        body: sequence(block.getInputTargetBlock('BODY'), context),
      };

    case BLOCK_TYPES.branch:
      return {
        op: 'if',
        cond: condition(block.getInputTargetBlock('COND')),
        then: sequence(block.getInputTargetBlock('THEN'), context),
      };

    case BLOCK_TYPES.comment:
      return { op: 'comment', text: String(block.getFieldValue('TEXT') ?? '') };

    default:
      throw new BlockTranslationError(block.type, 'редактор не знает такой команды');
  }
}

/**
 * Условие из блока-шестиугольника.
 *
 * Пустой разъём — обычное состояние наполовину собранной программы, а не
 * поломка: считаем условие ложным, чтобы ученик мог запустить и увидеть, что
 * ветка не сработала, вместо непонятной ошибки.
 */
function condition(block: BlockLike | null): Condition {
  if (block === null) {
    return {
      kind: 'compare',
      operator: '==',
      left: { kind: 'number', value: 0 },
      right: { kind: 'number', value: 1 },
    };
  }

  if (block.type === BLOCK_TYPES.inputIs) {
    return {
      kind: 'digitalInput',
      bank: bank(block),
      index: channel(block),
      value: state(block),
    };
  }

  throw new BlockTranslationError(block.type, 'этот блок нельзя использовать как условие');
}

function number(block: BlockLike, field: string): number {
  const value = Number(block.getFieldValue(field));
  if (!Number.isFinite(value)) {
    throw new BlockTranslationError(block.type, `поле ${field} не число`);
  }
  return value;
}

function channel(block: BlockLike): number {
  const value = Math.round(number(block, 'INDEX'));
  if (value < 1) {
    throw new BlockTranslationError(block.type, 'номер канала начинается с 1');
  }
  return value;
}

function bank(block: BlockLike): IoBank {
  return block.getFieldValue('BANK') === 'tool' ? 'tool' : 'cabinet';
}

function state(block: BlockLike): boolean {
  return block.getFieldValue('STATE') === 'on';
}

function action(block: BlockLike): 'open' | 'close' {
  return block.getFieldValue('ACTION') === 'open' ? 'open' : 'close';
}

function clampSpeed(value: number): number {
  return Math.min(1, Math.max(0.01, value));
}
