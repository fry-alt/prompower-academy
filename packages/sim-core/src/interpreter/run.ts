import type {
  Condition,
  Expression,
  Pose,
  PoseInput,
  Program,
  Statement,
  Value,
} from '../program/ast';
import { ioBankLabel } from '../io';
import { TICK_MS } from '../tick';
import {
  advanceTick,
  digitalInput,
  graspObject,
  moveObject,
  releaseObject,
  setDigitalOutput,
  setJoints,
  setVariable,
  type EventLog,
  type SimEvent,
  type Vec3,
  type WorldState,
} from '../world/state';
import { nearestGraspable } from '../world/grasp';
import type { MotionPlanner, MotionResult } from './motion';

/**
 * Пошаговый интерпретатор программы робота.
 *
 * Три свойства, ради которых он написан именно так:
 *
 * 1. Одна инструкция за шаг. Иначе не работают кнопки «шаг» и «пауза» и нечего
 *    подсвечивать в редакторе.
 * 2. Детерминированность. При одном и том же дереве и одном и том же начальном
 *    состоянии результат совпадает бит в бит: ни `Math.random()`, ни обращений
 *    к реальному времени здесь нет, время — счётчик тиков.
 * 3. Журнал событий. Он же основа отладки, автопроверки задания и будущей
 *    аналитики «где чаще всего застревают ученики».
 *
 * Состояние прогона неизменяемо: шаг возвращает новое. Это даёт перемотку и
 * сравнение с эталоном даром.
 */

/** Сколько шагов считаем признаком зацикливания. Вкладка не должна виснуть. */
const DEFAULT_MAX_STEPS = 100_000;

/** Предел витков раскрутки стека за один шаг. Ловит `while` с пустым телом. */
const MAX_UNWIND_TURNS = 10_000;

export type RunStatus = 'running' | 'finished' | 'failed';

/** Кадр исполнения: тело и позиция в нём. Рекурсии нет — иначе не поставить на паузу. */
interface Frame {
  readonly body: readonly Statement[];
  readonly index: number;
  readonly loop: LoopState | null;
}

type LoopState =
  | { readonly kind: 'repeat'; readonly remaining: number }
  | { readonly kind: 'while'; readonly cond: Condition };

export interface RunState {
  readonly world: WorldState;
  readonly log: EventLog;
  readonly stack: readonly Frame[];
  readonly status: RunStatus;
  /** Текст ошибки для пользователя. Заполнен только при `status === 'failed'`. */
  readonly error: string | null;
  readonly steps: number;
  /** Инструкция, которая выполнится следующей. Для подсветки блока в редакторе. */
  readonly current: Statement | null;
  /** Ожидание входа: с какого тика ждём. Иначе `null`. */
  readonly waitingSince: number | null;
  /** Последнее спланированное движение — сцене есть что проигрывать. */
  readonly lastMotion: readonly (readonly number[])[] | null;
}

export interface RunOptions {
  readonly maxSteps?: number;
  /**
   * На каком расстоянии от схвата деталь считается зажатой, метры.
   *
   * Это характеристика инструмента. Модели захвата у нас пока нет, поэтому
   * значение задаётся здесь; когда придёт настоящий гриппер, оно переедет в его
   * конфиг вместе с геометрией губок.
   */
  readonly graspReach?: number;
}

/** Половина типичного хода губок кобота. */
const DEFAULT_GRASP_REACH = 0.05;

/** Центр фланца в его собственной системе координат. */
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

export function createRun(program: Program, world: WorldState): RunState {
  return withCurrent({
    world,
    log: [],
    stack: [{ body: program.body, index: 0, loop: null }],
    status: 'running',
    error: null,
    steps: 0,
    current: null,
    waitingSince: null,
    lastMotion: null,
  });
}

/**
 * Выполняет одну инструкцию. Исключение — `waitDI`: он опрашивает вход по тику
 * за шаг, поэтому может занять несколько шагов подряд.
 */
export function step(state: RunState, planner: MotionPlanner, options: RunOptions = {}): RunState {
  if (state.status !== 'running') return state;

  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  if (state.steps >= maxSteps) {
    return fail(
      state,
      `Программа не завершилась за ${maxSteps} шагов. Похоже на цикл, из которого нет выхода.`,
    );
  }

  const unwound = unwind(state);
  if (unwound.status !== 'running') return unwound;

  const statement = currentStatement(unwound);
  if (statement === null) return finish(unwound);

  const executed = execute(unwound, statement, planner, options);
  return withCurrent({ ...executed, steps: executed.steps + 1 });
}

/** Крутит шаги до завершения либо до ошибки. Для тестов, CI и автопроверки заданий. */
export function runToCompletion(
  state: RunState,
  planner: MotionPlanner,
  options: RunOptions = {},
): RunState {
  let current = state;
  while (current.status === 'running') {
    current = step(current, planner, options);
  }
  return current;
}

// --- исполнение отдельных инструкций ---

function execute(
  state: RunState,
  statement: Statement,
  planner: MotionPlanner,
  options: RunOptions,
): RunState {
  switch (statement.op) {
    case 'comment':
      return next(logStatement(state, statement));

    case 'wait': {
      const ticks = Math.ceil(statement.ms / TICK_MS);
      return next({ ...logStatement(state, statement), world: advanceTick(state.world, ticks) });
    }

    case 'setVar': {
      const value = evaluate(statement.value, state.world.variables);
      const world = setVariable(state.world, statement.name, value);
      const logged = append(logStatement(state, statement), {
        kind: 'variable',
        tick: world.tick,
        name: statement.name,
        value,
      });
      return next({ ...logged, world });
    }

    case 'setDO': {
      const world = setDigitalOutput(
        state.world,
        statement.bank,
        statement.index,
        statement.value,
      );
      const logged = append(logStatement(state, statement), {
        kind: 'output',
        tick: world.tick,
        bank: statement.bank,
        index: statement.index,
        value: statement.value,
      });
      return next({ ...logged, world });
    }

    case 'gripper':
      return next(
        executeGripper(state, statement, planner, options.graspReach ?? DEFAULT_GRASP_REACH),
      );

    case 'waitDI':
      return executeWaitDigitalInput(state, statement);

    case 'if': {
      const branch = evaluateCondition(statement.cond, state.world)
        ? statement.then
        : (statement.else ?? []);
      return enter(next(logStatement(state, statement)), branch, null);
    }

    case 'repeat': {
      const logged = logStatement(state, statement);
      if (statement.times === 0) return next(logged);
      return enter(next(logged), statement.body, {
        kind: 'repeat',
        remaining: statement.times - 1,
      });
    }

    case 'while': {
      const logged = logStatement(state, statement);
      if (!evaluateCondition(statement.cond, state.world)) return next(logged);
      return enter(next(logged), statement.body, { kind: 'while', cond: statement.cond });
    }

    case 'moveJ':
      return executeMotion(
        state,
        statement,
        planner.planJoint(state.world.joints, statement.joints, statement),
        planner,
      );

    case 'moveL': {
      // Координаты считаются здесь, а не в планировщике: планировщик знает
      // кинематику и ничего не знает про переменные программы.
      const pose = resolvePose(statement.pose, state.world.variables);
      return executeMotion(
        state,
        statement,
        planner.planLinear(state.world.joints, pose, statement),
        planner,
      );
    }
  }
}

/** Числовая поза из вычисляемой: выражения разрешаются по текущим переменным. */
function resolvePose(pose: PoseInput, variables: Readonly<Record<string, number>>): Pose {
  return {
    x: resolveValue(pose.x, variables),
    y: resolveValue(pose.y, variables),
    z: resolveValue(pose.z, variables),
    rx: resolveValue(pose.rx, variables),
    ry: resolveValue(pose.ry, variables),
    rz: resolveValue(pose.rz, variables),
  };
}

function resolveValue(value: Value, variables: Readonly<Record<string, number>>): number {
  return typeof value === 'number' ? value : evaluate(value, variables);
}

/**
 * Закрытие схвата берёт деталь, до которой губки действительно дотягиваются.
 *
 * Положение схвата приходит из прямой кинематики через границу `MotionPlanner`:
 * интерпретатор по-прежнему не знает ни про URDF, ни про матрицы.
 */
function executeGripper(
  state: RunState,
  statement: Statement & { op: 'gripper' },
  planner: MotionPlanner,
  reach: number,
): RunState {
  const logged = logStatement(state, statement);

  if (statement.action === 'open') {
    const held = state.world.grasped;
    const world = releaseObject(state.world);
    return held === null
      ? { ...logged, world }
      : { ...append(logged, { kind: 'release', tick: world.tick, objectId: held }), world };
  }

  const tcp = planner.flangePoint(state.world.joints, ORIGIN);
  const target = nearestGraspable(state.world.objects, tcp, reach);

  if (target === null) {
    // Закрыть схват в пустоте не ошибка: так делают перед подходом к детали.
    // Но событие пишем — по нему автопроверка объяснит, почему деталь осталась
    // на месте, вместо бесполезного «задание не выполнено».
    return {
      ...append(logged, { kind: 'graspMissed', tick: state.world.tick }),
      world: { ...state.world, gripperOpen: false },
    };
  }

  const object = state.world.objects[target];
  if (object === undefined) return fail(logged, `Объекта «${target}» нет на сцене`);

  const world = graspObject(
    state.world,
    target,
    planner.offsetFromFlange(state.world.joints, object.position),
  );
  return {
    ...append(logged, { kind: 'grasp', tick: world.tick, objectId: target }),
    world,
  };
}

function executeWaitDigitalInput(
  state: RunState,
  statement: Statement & { op: 'waitDI' },
): RunState {
  const input = digitalInput(state.world, statement.bank, statement.index);
  if (input === null) {
    return fail(
      state,
      `Цифрового входа ${statement.index} у ${ioBankLabel(statement.bank)} нет.`,
    );
  }

  if (input === statement.value) {
    const logged = logStatement(state, statement);
    return next({ ...logged, waitingSince: null });
  }

  const waitingSince = state.waitingSince ?? state.world.tick;
  const world = advanceTick(state.world);

  if (statement.timeoutMs !== undefined) {
    const elapsedMs = (world.tick - waitingSince) * TICK_MS;
    if (elapsedMs >= statement.timeoutMs) {
      return fail(
        { ...state, world, waitingSince: null },
        `Сигнал на входе ${statement.index} ${ioBankLabel(statement.bank)} ` +
          `так и не появился за ${statement.timeoutMs} мс. ` +
          'Проверьте номер входа и то, что его кто-то включает.',
      );
    }
  }

  return { ...state, world, waitingSince };
}

function executeMotion(
  state: RunState,
  statement: Statement,
  result: MotionResult,
  planner: MotionPlanner,
): RunState {
  const logged = logStatement(state, statement);

  if (!result.ok) return fail(logged, result.refusal.reason);

  const { plan } = result;
  const moved = setJoints(advanceTick(state.world, plan.ticks), plan.joints);
  const world = carryGraspedObject(moved, planner);

  // Точка, где движение закончилось: по ней автопроверка засчитывает задания
  // без детали. Матрицы наружу не выходят — планировщик отдаёт точку сцены.
  const stopped = append(logged, {
    kind: 'moved',
    tick: world.tick,
    point: planner.flangePoint(plan.joints, ORIGIN),
  });

  return next({ ...stopped, world, lastMotion: plan.waypoints });
}


/**
 * Зажатая деталь едет вместе с фланцем.
 *
 * Без этого рука уносила бы кубик только на картинке, а в состоянии мира он
 * оставался бы лежать на столе — и автопроверка честно сообщала бы, что задание
 * не выполнено, хотя ученик всё сделал правильно.
 */
function carryGraspedObject(world: WorldState, planner: MotionPlanner): WorldState {
  if (world.grasped === null || world.graspOffset === null) return world;
  return moveObject(world, world.grasped, planner.flangePoint(world.joints, world.graspOffset));
}

// --- стек кадров ---

/**
 * Снимает исчерпанные кадры, при этом циклы получают шанс зайти на новый виток.
 *
 * Счётчик витков нужен из-за `while` с пустым телом: условие не меняется, кадр
 * снимать нельзя, и без ограничения вкладка зависла бы прямо здесь, не дойдя до
 * проверки шагов.
 */
function unwind(state: RunState): RunState {
  let current = state;

  for (let turn = 0; ; turn += 1) {
    if (turn > MAX_UNWIND_TURNS) {
      return fail(current, 'Цикл не может завершиться: его условие никогда не станет ложным.');
    }

    const frame = top(current);
    if (frame === null) return current;
    if (frame.index < frame.body.length) return current;

    if (frame.loop === null) {
      current = { ...current, stack: current.stack.slice(0, -1) };
      continue;
    }

    if (frame.loop.kind === 'repeat') {
      if (frame.loop.remaining <= 0) {
        current = { ...current, stack: current.stack.slice(0, -1) };
        continue;
      }
      current = replaceTop(current, {
        ...frame,
        index: 0,
        loop: { kind: 'repeat', remaining: frame.loop.remaining - 1 },
      });
      continue;
    }

    if (!evaluateCondition(frame.loop.cond, current.world)) {
      current = { ...current, stack: current.stack.slice(0, -1) };
      continue;
    }
    current = replaceTop(current, { ...frame, index: 0 });
  }
}

function currentStatement(state: RunState): Statement | null {
  const frame = top(state);
  if (frame === null) return null;
  return frame.body[frame.index] ?? null;
}

/** Переставляет курсор верхнего кадра на следующую инструкцию. */
function next(state: RunState): RunState {
  const frame = top(state);
  if (frame === null) return state;
  return replaceTop(state, { ...frame, index: frame.index + 1 });
}

/** Кладёт на стек тело ветки или цикла. */
function enter(state: RunState, body: readonly Statement[], loop: LoopState | null): RunState {
  if (body.length === 0 && loop === null) return state;
  return { ...state, stack: [...state.stack, { body, index: 0, loop }] };
}

function top(state: RunState): Frame | null {
  return state.stack[state.stack.length - 1] ?? null;
}

function replaceTop(state: RunState, frame: Frame): RunState {
  return { ...state, stack: [...state.stack.slice(0, -1), frame] };
}

// --- выражения и условия ---

export function evaluate(
  expression: Expression,
  variables: Readonly<Record<string, number>>,
): number {
  switch (expression.kind) {
    case 'number':
      return expression.value;

    case 'variable':
      // Необъявленная переменная равна нулю: так же ведут себя контроллеры роботов.
      return variables[expression.name] ?? 0;

    case 'binary': {
      const left = evaluate(expression.left, variables);
      const right = evaluate(expression.right, variables);
      switch (expression.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          // Деление на ноль даёт ноль, а не Infinity: NaN в позе робота хуже.
          return right === 0 ? 0 : left / right;
      }
    }
  }
}

export function evaluateCondition(condition: Condition, world: WorldState): boolean {
  switch (condition.kind) {
    case 'digitalInput':
      return (digitalInput(world, condition.bank, condition.index) ?? false) === condition.value;

    case 'not':
      return !evaluateCondition(condition.operand, world);

    case 'and':
      return (
        evaluateCondition(condition.left, world) && evaluateCondition(condition.right, world)
      );

    case 'or':
      return evaluateCondition(condition.left, world) || evaluateCondition(condition.right, world);

    case 'compare': {
      const left = evaluate(condition.left, world.variables);
      const right = evaluate(condition.right, world.variables);
      switch (condition.operator) {
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        case '<':
          return left < right;
        case '<=':
          return left <= right;
        case '>':
          return left > right;
        case '>=':
          return left >= right;
      }
    }
  }
}

// --- журнал и терминальные состояния ---

function logStatement(state: RunState, statement: Statement): RunState {
  return append(state, { kind: 'statement', tick: state.world.tick, op: statement.op });
}

function append(state: RunState, event: SimEvent): RunState {
  return { ...state, log: [...state.log, event] };
}

function finish(state: RunState): RunState {
  return {
    ...append(state, { kind: 'finished', tick: state.world.tick }),
    status: 'finished',
    current: null,
  };
}

function fail(state: RunState, message: string): RunState {
  return {
    ...append(state, { kind: 'error', tick: state.world.tick, message }),
    status: 'failed',
    error: message,
    current: null,
  };
}

function withCurrent(state: RunState): RunState {
  if (state.status !== 'running') return state;
  const unwound = unwind(state);
  return { ...unwound, current: currentStatement(unwound) };
}

