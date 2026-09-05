import type { Program, Statement } from '../program/ast';
import type { EventLog, WorldState } from '../world/state';
import { zoneContaining } from '../world/aabb';
import type { Constraint, Goal, Hint, Task } from './task';

/**
 * Автопроверка задания.
 *
 * Валидаторы — чистые функции от конечного состояния мира и журнала событий.
 * Никакого доступа к сцене и к React: те же задания гоняются в CI без браузера.
 *
 * Главное требование §6 брифа — конкретность. Не «задание не выполнено», а
 * «Кубик оказался в зоне A, а нужен в зоне B». Ошибка обязана объяснять, что
 * произошло и что делать, поэтому журнал событий здесь так же важен, как
 * конечное состояние: по нему видно, например, что схват смыкался впустую.
 */

export interface CheckResult {
  readonly passed: boolean;
  /** Человеческие объяснения провалов. Пустой массив — задание выполнено. */
  readonly failures: readonly string[];
}

export function checkTask(
  task: Task,
  program: Program,
  world: WorldState,
  log: EventLog,
): CheckResult {
  const failures = [
    ...task.goals.map((goal) => checkGoal(goal, world, log)),
    ...task.constraints.map((constraint) => checkConstraint(constraint, program)),
  ].filter((failure): failure is string => failure !== null);

  return { passed: failures.length === 0, failures };
}

/** Возвращает текст провала или `null`, если цель достигнута. */
function checkGoal(goal: Goal, world: WorldState, log: EventLog): string | null {
  switch (goal.type) {
    case 'objectInZone':
      return checkObjectInZone(goal, world, log);
    case 'gripperState':
      return checkGripperState(goal, world);
  }
}

function checkObjectInZone(
  goal: Goal & { type: 'objectInZone' },
  world: WorldState,
  log: EventLog,
): string | null {
  const object = world.objects[goal.object];
  if (object === undefined) return `На сцене нет детали «${goal.object}».`;

  const target = world.zones[goal.zone];
  if (target === undefined) return `На сцене нет зоны «${goal.zone}».`;

  const actual = zoneContaining(world.zones, object);
  if (actual === goal.zone) return null;

  if (actual !== null) {
    return `Деталь «${goal.object}» оказалась в зоне «${actual}», а нужна в зоне «${goal.zone}».`;
  }

  // Деталь никуда не попала. Журнал показывает, почему именно, — и это
  // полезнее, чем сухое «не в зоне».
  if (!log.some((event) => event.kind === 'grasp')) {
    return log.some((event) => event.kind === 'graspMissed')
      ? `Деталь «${goal.object}» осталась на месте: схват смыкался, но она не попала между губок.`
      : `Деталь «${goal.object}» осталась на месте: её так и не взяли захватом.`;
  }

  return `Деталь «${goal.object}» не в зоне «${goal.zone}» — она осталась вне размеченных областей.`;
}

function checkGripperState(
  goal: Goal & { type: 'gripperState' },
  world: WorldState,
): string | null {
  const open = goal.state === 'open';
  if (world.gripperOpen === open) return null;

  return open
    ? 'Захват остался закрытым в конце программы, а должен быть открыт.'
    : 'Захват остался открытым в конце программы, а должен быть закрыт.';
}

/**
 * Ограничение на размер программы считается по дереву, а не по журналу.
 *
 * Иначе цикл на десять витков выглядел бы как десять инструкций, и требование
 * «уложись в 12 блоков» наказывало бы ровно за то, чему урок учит.
 */
function checkConstraint(constraint: Constraint, program: Program): string | null {
  const count = countStatements(program.body);
  if (count <= constraint.value) return null;

  return `В программе ${count} инструкций, а разрешено не больше ${constraint.value}.`;
}

function countStatements(body: readonly Statement[]): number {
  let count = 0;

  for (const statement of body) {
    count += 1;
    if (statement.op === 'repeat' || statement.op === 'while') {
      count += countStatements(statement.body);
    } else if (statement.op === 'if') {
      count += countStatements(statement.then);
      count += countStatements(statement.else ?? []);
    }
  }

  return count;
}

/**
 * Подсказки, заслуженные числом неудачных попыток, от ранней к поздней.
 *
 * Отдаётся вся лестница, а не последняя ступень: открывшаяся вторая подсказка
 * не отменяет первую, и ученику нужны обе сразу.
 */
export function earnedHints(task: Task, failedAttempts: number): readonly Hint[] {
  return task.hints
    .filter((hint) => hint.afterFailedAttempts <= failedAttempts)
    .sort((a, b) => a.afterFailedAttempts - b.afterFailedAttempts);
}
