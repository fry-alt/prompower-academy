import type { Program, Statement } from '../program/ast';
import type { EventLog, Vec3, WorldState } from '../world/state';
import { flangePose, jointFrames, type KinematicChain } from '../kinematics/chain';
import { normalizeAngle } from '../kinematics/joint-limits';
import { translationOf } from '../kinematics/transform';
import { distanceToBox, zoneContaining } from '../world/aabb';
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

/** Одна цель задания и то, что мешает её засчитать. */
export interface GoalStatus {
  readonly goal: Goal;
  /** Текст провала или `null`, если цель достигнута. */
  readonly failure: string | null;
}

/**
 * Статус каждой цели по отдельности.
 *
 * Экрану урока нужна отметка против строки, а не общий вердикт в конце: в
 * ручном задании цели берут одну за другой и видят это сразу.
 */
export function checkGoals(
  task: Task,
  world: WorldState,
  log: EventLog,
  chain: KinematicChain,
): readonly GoalStatus[] {
  return task.goals.map((goal) => ({ goal, failure: checkGoal(goal, world, log, chain) }));
}

/**
 * Нарушенные запреты движения.
 *
 * Отдельно от `checkTask` потому, что запрет проверяют не в конце, а всё время:
 * ручной урок спрашивает об этом на каждое движение ползунка.
 */
export function checkKeepOuts(
  task: Task,
  world: WorldState,
  chain: KinematicChain,
): readonly string[] {
  return task.constraints
    .map((constraint) =>
      constraint.type === 'keepOut' ? checkKeepOut(constraint, world, chain) : null,
    )
    .filter((failure): failure is string => failure !== null);
}

export function checkTask(
  task: Task,
  program: Program,
  world: WorldState,
  log: EventLog,
  chain: KinematicChain,
): CheckResult {
  const failures = [
    ...checkGoals(task, world, log, chain).map((status) => status.failure),
    ...checkKeepOuts(task, world, chain),
    ...task.constraints.map((constraint) => checkConstraint(constraint, program)),
  ].filter((failure): failure is string => failure !== null);

  return { passed: failures.length === 0, failures };
}

function checkKeepOut(
  constraint: Constraint & { type: 'keepOut' },
  world: WorldState,
  chain: KinematicChain,
): string | null {
  const zone = world.zones[constraint.zone];
  if (zone === undefined) return `На сцене нет зоны «${constraint.zone}».`;

  const points = robotPoints(world, chain);
  if (points === null) return jointsMismatch(world, chain);

  return points.some((point) => distanceToBox(point, zone) === 0)
    ? `Робот вошёл в зону «${zone.id}» — туда заходить нельзя.`
    : null;
}

/**
 * Точки робота: начала суставов и фланец.
 *
 * Звено между двумя точками не проверяется — очень тонкая зона между суставами
 * пройдёт незамеченной. Это та же граница, что у всей физики проекта (§13
 * брифа): кинематика и AABB — потолок, а зона урока заведомо крупнее звена.
 */
function robotPoints(world: WorldState, chain: KinematicChain): Vec3[] | null {
  if (world.joints.length !== chain.joints.length) return null;

  const flange = flangePose(chain, world.joints);
  return [
    ...jointFrames(chain, world.joints).map((frame) => translationOf(frame)),
    { x: flange.x, y: flange.y, z: flange.z },
  ];
}

/** Мир и модель разошлись числом суставов: это ошибка сборки, а не поза. */
function jointsMismatch(world: WorldState, chain: KinematicChain): string {
  return (
    `Робот собран с ${world.joints.length} углами, а у модели ${chain.joints.length} суставов: ` +
    'положение инструмента не посчитать.'
  );
}

/** Возвращает текст провала или `null`, если цель достигнута. */
function checkGoal(
  goal: Goal,
  world: WorldState,
  log: EventLog,
  chain: KinematicChain,
): string | null {
  switch (goal.type) {
    case 'objectInZone':
      return checkObjectInZone(goal, world, log);
    case 'gripperState':
      return checkGripperState(goal, world);
    case 'pointsVisited':
      return checkPointsVisited(goal, log);
    case 'jointsAtPose':
      return checkJointsAtPose(goal, world);
    case 'flangeAtPoint':
      return checkFlangeAtPoint(goal, world, chain);
  }
}

/**
 * Где фланец стоит сейчас — против точки задания.
 *
 * Прямая кинематика считается здесь, а не берётся из состояния мира: поза
 * фланца выводится из углов, и хранить её рядом с ними значило бы завести
 * второй источник правды об одном и том же.
 */
function checkFlangeAtPoint(
  goal: Goal & { type: 'flangeAtPoint' },
  world: WorldState,
  chain: KinematicChain,
): string | null {
  // Расхождение объясняется словами, а не исключением из кинематики: проверка
  // зовётся на каждое движение ползунка прямо в отрисовке, и брошенная ошибка
  // унесла бы с собой весь экран урока.
  if (world.joints.length !== chain.joints.length) return jointsMismatch(world, chain);

  const actual = flangePose(chain, world.joints);
  const gap = distance(actual, goal.point);
  if (gap <= goal.tolerance) return null;

  return (
    `Инструмент в ${millimetres(gap)} мм от точки: ` +
    `X ${millimetres(goal.point.x)}, Y ${millimetres(goal.point.y)}, Z ${millimetres(goal.point.z)} мм.`
  );
}

/**
 * Поза против текущих углов.
 *
 * Разница считается через `normalizeAngle`: сустав, провернувшийся на полный
 * оборот, стоит там же, где стоял, и ученик, который до этого дошёл, прав.
 *
 * Называется один сустав — тот, что дальше всех. Список из шести строк ученику
 * читать нечем, а чинить всё равно надо с худшего.
 */
function checkJointsAtPose(
  goal: Goal & { type: 'jointsAtPose' },
  world: WorldState,
): string | null {
  if (goal.joints.length > world.joints.length) {
    return `Поза задания описывает ${goal.joints.length} суставов, а у робота их ${world.joints.length}.`;
  }

  let worst = -1;
  let error = 0;

  goal.joints.forEach((target, index) => {
    const actual = world.joints[index] ?? 0;
    const gap = Math.abs(normalizeAngle(actual - target));
    if (gap > error) {
      error = gap;
      worst = index;
    }
  });

  if (worst === -1 || error <= goal.tolerance) return null;

  return (
    `Сустав ${worst + 1} не на месте: нужно ${degrees(goal.joints[worst]!)}°, ` +
    `сейчас ${degrees(world.joints[worst] ?? 0)}° — разница ${degrees(error)}°.`
  );
}

/** Градусы из радианов: на экране суставы подписаны градусами. */
function degrees(radians: number): string {
  return rounded((radians * 180) / Math.PI);
}

/**
 * Точки задания против точек, где движения заканчивались.
 *
 * Координаты в тексте — миллиметры: ученик набирает их такими же в блоке
 * движения, и метры ядра ему ни о чём не скажут.
 */
function checkPointsVisited(goal: Goal & { type: 'pointsVisited' }, log: EventLog): string | null {
  const visited = log.filter((event) => event.kind === 'moved').map((event) => event.point);

  const missed = goal.points.findIndex(
    (point) => !visited.some((stop) => distance(stop, point) <= goal.tolerance),
  );
  if (missed === -1) return null;

  const point = goal.points[missed]!;
  return (
    `Робот не побывал в точке ${missed + 1}: ` +
    `X ${millimetres(point.x)}, Y ${millimetres(point.y)}, Z ${millimetres(point.z)} мм.`
  );
}

function distance(from: Vec3, to: Vec3): number {
  return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
}

/** Миллиметры из метров: числа в тексте те же, что ученик набирает в блоке. */
function millimetres(metres: number): string {
  return rounded(metres * 1000);
}

/** Минус здесь типографский: это текст для человека, а не выражение. */
function rounded(value: number): string {
  const whole = Math.round(value);
  return whole < 0 ? `−${Math.abs(whole)}` : String(whole);
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

  // Деталь, оставшаяся в схвате, ни в какой зоне не лежит, даже если висит над
  // нужной: это самая частая ошибка, и назвать её надо прямо.
  if (world.grasped === goal.object) {
    return `Деталь «${goal.object}» осталась в захвате: откройте схват над зоной «${goal.zone}».`;
  }

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
 *
 * Комментарии не считаются: это пояснение для человека, а не команда роботу,
 * и наказывать за подписанную программу значит учить её не подписывать.
 *
 * Запреты движения сюда не попадают: их проверяет `checkKeepOuts`, и программа
 * им не нужна.
 */
function checkConstraint(constraint: Constraint, program: Program): string | null {
  if (constraint.type !== 'maxStatements') return null;

  const count = countStatements(program.body);
  if (count <= constraint.value) return null;

  return `В программе ${count} инструкций, а разрешено не больше ${constraint.value}.`;
}

function countStatements(body: readonly Statement[]): number {
  let count = 0;

  for (const statement of body) {
    if (statement.op === 'comment') continue;
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
