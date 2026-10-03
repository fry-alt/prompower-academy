'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkTask,
  createPlanner,
  createRun,
  createWorld,
  step as stepRun,
  TICK_MS,
  type CheckResult,
  type KinematicChain,
  type Program,
  type RunState,
  type SceneObject,
  type Task,
} from '@prompower/sim-core';

/**
 * Проигрывание программы поверх пошагового интерпретатора.
 *
 * Интерпретатор исполняет по одной инструкции и возвращает новое состояние —
 * этого хватает кнопкам «шаг», «пауза» и подсветке текущего блока. Но движение
 * должно быть видно, а не мигать скачком, поэтому кадры разложены здесь: шаг
 * даёт список промежуточных поз, а этот хук проигрывает их по времени.
 *
 * Ядро при этом остаётся детерминированным: скорость воспроизведения меняет
 * только длительность анимации, а не результат прогона (§6 брифа).
 */

export type RunStatus = 'idle' | 'playing' | 'paused' | 'done';

export interface ProgramRun {
  readonly run: RunState;
  /**
   * Объекты сцены для отрисовки. Отличаются от `run.world.objects` во время
   * шага: зажатая деталь пересчитывается по анимированным углам, а деталь на
   * ленте едет плавно — иначе обе стояли бы на месте и телепортировались.
   */
  readonly objects: Readonly<Record<string, SceneObject>>;
  /** Углы для сцены: между шагами они идут по промежуточным позам. */
  readonly joints: readonly number[];
  readonly status: RunStatus;
  readonly speed: number;
  /** Результат автопроверки. Появляется, когда программа доработала. */
  readonly check: CheckResult | null;
  /** Сколько раз программа доработала, не пройдя проверку. По ним открываются подсказки. */
  readonly failedAttempts: number;
  readonly play: () => void;
  readonly pause: () => void;
  readonly stepOnce: () => void;
  readonly reset: () => void;
  readonly setSpeed: (value: number) => void;
}

interface Animation {
  readonly waypoints: readonly (readonly number[])[];
  readonly startedAt: number;
  readonly durationMs: number;
  /** Детали в начале и в конце шага: лента везёт их плавно, а не скачком. */
  readonly from: Readonly<Record<string, SceneObject>>;
  readonly to: Readonly<Record<string, SceneObject>>;
}

/** Что показывает сцена прямо сейчас: посреди шага — промежуточный кадр. */
interface Frame {
  readonly joints: readonly number[];
  /** Детали посреди шага. `null` — сцена показывает состояние мира как есть. */
  readonly objects: Readonly<Record<string, SceneObject>> | null;
}

export function useProgramRun(
  chain: KinematicChain,
  program: Program,
  task: Task,
  homePose: readonly number[],
): ProgramRun {
  const planner = useMemo(() => createPlanner(chain), [chain]);

  // Стартовая поза задания важнее домашней позы модели: автор урока ставит
  // робота туда, откуда задание задумано. Ручной урок это уже соблюдал.
  const startPose = useMemo(() => [...(task.world.joints ?? homePose)], [task, homePose]);

  const startWorld = useCallback(
    () =>
      createWorld({
        joints: [...startPose],
        objects: [...task.world.objects],
        zones: [...task.world.zones],
        conveyors: [...task.world.conveyors],
        sensors: [...task.world.sensors],
      }),
    [startPose, task],
  );

  const [run, setRun] = useState<RunState>(() => createRun(program, startWorld()));
  const [frame, setFrame] = useState<Frame>(() => ({ joints: [...startPose], objects: null }));
  const [status, setStatus] = useState<RunStatus>('idle');
  const [speed, setSpeed] = useState(1);

  const runRef = useRef(run);
  const animation = useRef<Animation | null>(null);
  const speedRef = useRef(speed);

  runRef.current = run;
  speedRef.current = speed;

  const restart = useCallback(() => {
    animation.current = null;
    const fresh = createRun(program, startWorld());
    runRef.current = fresh;
    setRun(fresh);
    setFrame({ joints: [...startPose], objects: null });
    setStatus('idle');
  }, [program, startWorld, startPose]);

  /**
   * Правка программы начинает прогон заново.
   *
   * Без этого прогон навсегда оставался бы тем, с которым его создали: ученик
   * менял блоки, жал «запуск» и смотрел, как исполняется прошлая версия. Ровно
   * это и случилось при первом запуске редактора.
   */
  useEffect(() => {
    restart();
  }, [restart]);

  /** Один шаг интерпретатора плюс запуск анимации его движения или паузы. */
  const advance = useCallback((): RunState => {
    const before = runRef.current;
    if (before.status !== 'running') return before;

    const after = stepRun(before, planner);
    runRef.current = after;
    setRun(after);

    const ticks = after.world.tick - before.world.tick;
    // Новое движение узнаётся по новому массиву, а не по его наличию: прошлое
    // движение остаётся в состоянии и после себя, и раньше каждый «закрыть
    // захват» проигрывал предыдущий путь заново — рука дёргалась назад.
    const motion = after.lastMotion !== before.lastMotion ? after.lastMotion : null;

    // Пауза тоже должна длиться: «ждать 2 с» раньше проскакивала мгновенно, а
    // деталь на ленте телепортировалась. Одиночный тик ожидания сигнала идёт
    // без задержки — его темп и так задаёт кадр.
    if (motion !== null || ticks > 1) {
      animation.current = {
        waypoints: motion ?? [after.world.joints],
        startedAt: performance.now(),
        durationMs: (Math.max(1, ticks) * TICK_MS) / Math.max(speedRef.current, 0.01),
        from: before.world.objects,
        to: after.world.objects,
      };
    } else {
      setFrame({ joints: [...after.world.joints], objects: null });
    }

    return after;
  }, [planner]);

  // Кадры анимации и переход к следующей инструкции.
  useEffect(() => {
    if (status !== 'playing' && animation.current === null) return;

    let handle = 0;
    const tick = (): void => {
      const current = animation.current;

      if (current !== null) {
        const progress = Math.min(1, (performance.now() - current.startedAt) / current.durationMs);
        if (progress >= 1) {
          animation.current = null;
          setFrame({ joints: poseAt(current.waypoints, 1), objects: null });
        } else {
          setFrame({
            joints: poseAt(current.waypoints, progress),
            objects: objectsAt(current.from, current.to, progress),
          });
        }
      } else if (status === 'playing') {
        // Инструкции без движения идут по одной за кадр, и ползунок скорости их
        // не касался: ожидание сигнала с конвейера промотать было нечем. Шаги
        // делаются пачкой по множителю скорости и обрываются, как только
        // началось движение — его показывает анимация, а не счётчик шагов.
        const steps = Math.max(1, Math.round(speedRef.current));

        for (let i = 0; i < steps; i += 1) {
          const after = advance();
          if (after.status !== 'running') {
            setStatus('done');
            // Последнее движение ещё надо доиграть — кадры идут, пока оно не
            // кончится, иначе робот застыл бы на полпути.
            if (animation.current === null) return;
            break;
          }
          if (animation.current !== null) break;
        }
      } else {
        return;
      }

      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [status, advance]);

  const objects = useMemo(() => {
    const source = frame.objects ?? run.world.objects;
    const { grasped, graspOffset } = run.world;
    if (grasped === null || graspOffset === null) return source;

    const held = source[grasped];
    if (held === undefined || frame.joints.length === 0) return source;

    return {
      ...source,
      [grasped]: { ...held, position: planner.flangePoint(frame.joints, graspOffset) },
    };
  }, [run.world, frame, planner]);

  const check = useMemo(
    () => (run.status === 'running' ? null : checkTask(task, program, run.world, run.log, chain)),
    [run.status, run.world, run.log, task, program, chain],
  );

  /**
   * Неудачные попытки: по ним открываются подсказки урока.
   *
   * Считается доработавшая программа, не прошедшая проверку, а не нажатие
   * «запуск»: до конца доходят и шагами. Один прогон считается один раз —
   * отсюда сравнение по объекту состояния. Перезапуск счётчик не трогает:
   * между попытками программу как раз и правят.
   */
  const counted = useRef<RunState | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    if (status !== 'done' || check === null || check.passed) return;
    if (counted.current === run) return;

    counted.current = run;
    setFailedAttempts((count) => count + 1);
  }, [status, check, run]);

  return {
    run,
    objects,
    joints: frame.joints,
    status,
    speed,
    check,
    failedAttempts,
    play: useCallback(() => {
      if (runRef.current.status === 'running') setStatus('playing');
    }, []),
    pause: useCallback(() => {
      setStatus((value) => (value === 'playing' ? 'paused' : value));
    }, []),
    stepOnce: useCallback(() => {
      setStatus('paused');
      const after = advance();
      if (after.status !== 'running') setStatus('done');
    }, [advance]),
    reset: restart,
    setSpeed,
  };
}

/** Поза на доле `progress` пути: линейно между соседними промежуточными позами. */
function poseAt(
  waypoints: readonly (readonly number[])[],
  progress: number,
): readonly number[] {
  const last = waypoints.length - 1;
  if (last < 0) return [];
  if (progress >= 1) return [...waypoints[last]!];

  const exact = progress * last;
  const index = Math.floor(exact);
  const from = waypoints[index] ?? waypoints[0]!;
  const to = waypoints[Math.min(last, index + 1)] ?? from;
  const fraction = exact - index;

  return from.map((value, joint) => value + ((to[joint] ?? value) - value) * fraction);
}

/**
 * Детали на доле `progress` шага. Зажатую деталь здесь не трогаем: она едет с
 * рукой, и её место считается по углам кадра.
 */
function objectsAt(
  from: Readonly<Record<string, SceneObject>>,
  to: Readonly<Record<string, SceneObject>>,
  progress: number,
): Readonly<Record<string, SceneObject>> {
  if (from === to) return to;

  const result: Record<string, SceneObject> = {};
  for (const [id, end] of Object.entries(to)) {
    const start = from[id];
    result[id] =
      start === undefined || start === end
        ? end
        : {
            ...end,
            position: {
              x: start.position.x + (end.position.x - start.position.x) * progress,
              y: start.position.y + (end.position.y - start.position.y) * progress,
              z: start.position.z + (end.position.z - start.position.z) * progress,
            },
          };
  }
  return result;
}
