import type { Program, Statement } from '@prompower/sim-core';

/**
 * Сценарий обучения: куда смотреть и что нажать.
 *
 * Лежит рядом с уроком (`tour.<locale>.json`) и разбирается здесь, а не в
 * ядре: ядро ничего не знает про интерфейс, а шаг описан селектором разметки.
 *
 * Проверяем явно, как задания: файл пишет автор курса, и ошибка обязана
 * называть путь до места.
 */

/** Что закрывает шаг. */
export type StepDone =
  /** Нажали ровно то, что подсвечено. */
  | { readonly kind: 'click' }
  /** В программе появилось нужное число таких инструкций. */
  | { readonly kind: 'programHas'; readonly op: string; readonly count: number }
  /** Задание зачтено автопроверкой. */
  | { readonly kind: 'passed' };

export interface TourStep {
  /** Селектор цели. Должен переживать вёрстку: `data-` атрибут или класс блока. */
  readonly target: string;
  readonly text: string;
  readonly done: StepDone;
}

export interface Tour {
  readonly steps: readonly TourStep[];
}

export class TourParseError extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'TourParseError';
  }
}

export function parseTour(input: unknown): Tour {
  const root = asRecord(input, 'tour');
  const steps = asArray(root['steps'], 'tour.steps').map((step, index) =>
    parseStep(step, `tour.steps[${index}]`),
  );

  if (steps.length === 0) {
    throw new TourParseError('tour.steps', 'сценарий без шагов показывать нечем');
  }

  return { steps };
}

function parseStep(input: unknown, path: string): TourStep {
  const record = asRecord(input, path);

  return {
    target: asNonEmptyString(record['target'], `${path}.target`),
    text: asNonEmptyString(record['text'], `${path}.text`),
    done: parseDone(record['done'], `${path}.done`),
  };
}

function parseDone(input: unknown, path: string): StepDone {
  if (input === 'click') return { kind: 'click' };
  if (input === 'passed') return { kind: 'passed' };

  if (typeof input === 'object' && input !== null) {
    const record = asRecord(input, path);
    const op = asNonEmptyString(record['op'], `${path}.op`);
    const count = record['count'];

    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new TourParseError(`${path}.count`, 'нужно целое число инструкций от единицы');
    }

    return { kind: 'programHas', op, count };
  }

  throw new TourParseError(path, `ожидалось «click», «passed» или { op, count }`);
}

/**
 * Сколько таких инструкций в программе.
 *
 * Считается всё дерево: блок, брошенный внутрь цикла, — тоже брошенный блок, и
 * шаг обучения обязан это засчитать.
 */
export function countOp(program: Program, op: string): number {
  return count(program.body, op);
}

function count(body: readonly Statement[], op: string): number {
  let found = 0;

  for (const statement of body) {
    if (statement.op === op) found += 1;

    if (statement.op === 'repeat' || statement.op === 'while') {
      found += count(statement.body, op);
    } else if (statement.op === 'if') {
      found += count(statement.then, op);
      found += count(statement.else ?? [], op);
    }
  }

  return found;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TourParseError(path, 'ожидался объект');
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TourParseError(path, 'ожидался массив');
  return value;
}

function asNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TourParseError(path, 'ожидалась непустая строка');
  }
  return value;
}
