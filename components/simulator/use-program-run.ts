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
   * движения: зажатая деталь пересчитывается по анимированным углам, иначе она
   * стоит на месте весь путь и телепортируется в конце.
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
}

export function useProgramRun(
  chain: KinematicChain,
  program: Program,
  task: Task,
  homePose: readonly number[],
): ProgramRun {
  const planner = useMemo(() => createPlanner(chain), [chain]);

  const startWorld = useCallback(
    () =>
      createWorld({
        joints: [...homePose],
        objects: [...task.world.objects],
        zones: [...task.world.zones],
      }),
    [homePose, task],
  );

  const [run, setRun] = useState<RunState>(() => createRun(program, startWorld()));
  const [joints, setJoints] = useState<readonly number[]>(() => [...homePose]);
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
    setJoints([...homePose]);
    setStatus('idle');
  }, [program, startWorld, homePose]);

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

  /** Один шаг интерпретатора плюс запуск анимации его движения. */
  const advance = useCallback((): RunState => {
    const before = runRef.current;
    if (before.status !== 'running') return before;

    const after = stepRun(before, planner);
    runRef.current = after;
    setRun(after);

    const waypoints = after.lastMotion;
    if (waypoints !== null && waypoints.length > 0) {
      const ticks = Math.max(1, after.world.tick - before.world.tick);
      animation.current = {
        waypoints,
        startedAt: performance.now(),
        durationMs: (ticks * TICK_MS) / Math.max(speedRef.current, 0.01),
      };
    } else {
      setJoints([...after.world.joints]);
    }

    return after;
  }, [planner]);

  // Кадры анимации и переход к следующей инструкции.
  useEffect(() => {
    if (status !== 'playing' && animation.current === null) return;

    let frame = 0;
    const tick = (): void => {
      const current = animation.current;

      if (current !== null) {
        const progress = Math.min(1, (performance.now() - current.startedAt) / current.durationMs);
        setJoints(poseAt(current.waypoints, progress));
        if (progress >= 1) animation.current = null;
      } else if (status === 'playing') {
        const after = advance();
        if (after.status !== 'running') {
          setStatus('done');
          return;
        }
      } else {
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, advance]);

  const objects = useMemo(() => {
    const { grasped, graspOffset, objects: source } = run.world;
    if (grasped === null || graspOffset === null) return source;

    const held = source[grasped];
    if (held === undefined || joints.length === 0) return source;

    return { ...source, [grasped]: { ...held, position: planner.flangePoint(joints, graspOffset) } };
  }, [run.world, joints, planner]);

  const check = useMemo(
    () => (run.status === 'running' ? null : checkTask(task, program, run.world, run.log)),
    [run.status, run.world, run.log, task, program],
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
    joints,
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
