/**
 * Программа робота как дерево, а не как текст.
 *
 * Одно и то же дерево исполняется симулятором и превращается в скрипт на Python
 * под JAKA SDK. Строка кода источником истины не является никогда: из текста
 * нельзя надёжно восстановить блоки, а из блоков текст — можно.
 */

import type { IoBank } from '../io';

/**
 * Поза фланца в единицах СИ: метры и радианы.
 *
 * На планшете то же самое показано в миллиметрах и градусах — перевод делается
 * на границе отображения, внутри ядра единицы совпадают с URDF.
 */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
}

/**
 * Значение в программе: число либо выражение, считаемое на ходу.
 *
 * Литерал остаётся числом, а не оборачивается в `{kind:'number'}`: иначе каждое
 * задание и каждая стартовая программа в репозитории пришлось бы переписать
 * ради единообразия, которого никто не увидит.
 */
export type Value = number | Expression;

/**
 * Цель движения в программе: любая координата может считаться по переменным.
 *
 * Не то же, что `Pose`: та — числа, и ею живёт кинематика. Интерпретатор
 * разрешает выражения по текущим переменным и отдаёт планировщику числовую позу.
 */
export interface PoseInput {
  readonly x: Value;
  readonly y: Value;
  readonly z: Value;
  readonly rx: Value;
  readonly ry: Value;
  readonly rz: Value;
}

export type BinaryOperator = '+' | '-' | '*' | '/';

export type Expression =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'variable'; readonly name: string }
  | {
      readonly kind: 'binary';
      readonly operator: BinaryOperator;
      readonly left: Expression;
      readonly right: Expression;
    };

export type CompareOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';

export type Condition =
  | {
      readonly kind: 'compare';
      readonly operator: CompareOperator;
      readonly left: Expression;
      readonly right: Expression;
    }
  | {
      readonly kind: 'digitalInput';
      readonly bank: IoBank;
      readonly index: number;
      readonly value: boolean;
    }
  | { readonly kind: 'not'; readonly operand: Condition }
  | { readonly kind: 'and'; readonly left: Condition; readonly right: Condition }
  | { readonly kind: 'or'; readonly left: Condition; readonly right: Condition };

export type GripperAction = 'open' | 'close';

/**
 * Скорость и ускорение — доли от паспортного максимума робота, 0…1.
 * Абсолютных значений здесь нет намеренно: они у каждой модели свои и живут в URDF.
 */
export interface MotionParams {
  readonly speed: number;
  readonly acc: number;
}

/**
 * Общее поле всех инструкций: идентификатор блока, из которого она получена.
 *
 * Нужен, чтобы подсвечивать текущий блок в редакторе во время исполнения.
 * Необязателен: программы в тестах и в заданиях собираются без Blockly.
 */
export interface StatementMeta {
  readonly id?: string;
}

/** Движение по осям: сустав в сустав, траектория фланца произвольная. */
type MoveJ = { readonly op: 'moveJ'; readonly joints: readonly number[] } & MotionParams;

/** Движение по прямой: фланец идёт в точку по отрезку. */
type MoveL = { readonly op: 'moveL'; readonly pose: PoseInput } & MotionParams;

type Command =
  | MoveJ
  | MoveL
  | {
      readonly op: 'setDO';
      readonly bank: IoBank;
      readonly index: number;
      readonly value: boolean;
    }
  | {
      readonly op: 'waitDI';
      readonly bank: IoBank;
      readonly index: number;
      readonly value: boolean;
      readonly timeoutMs?: number;
    }
  | { readonly op: 'gripper'; readonly action: GripperAction }
  | { readonly op: 'wait'; readonly ms: number }
  | { readonly op: 'repeat'; readonly times: number; readonly body: readonly Statement[] }
  | { readonly op: 'while'; readonly cond: Condition; readonly body: readonly Statement[] }
  | {
      readonly op: 'if';
      readonly cond: Condition;
      readonly then: readonly Statement[];
      readonly else?: readonly Statement[];
    }
  | { readonly op: 'setVar'; readonly name: string; readonly value: Expression }
  | { readonly op: 'comment'; readonly text: string };

export type Statement = StatementMeta & Command;

export type StatementOp = Statement['op'];

export interface Program {
  /** Версия формата. Понадобится, когда в базе уже будут лежать чужие программы. */
  readonly version: 1;
  readonly body: readonly Statement[];
}

export const PROGRAM_VERSION = 1;
