'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  checkGoals,
  createWorld,
  setJoints as setWorldJoints,
  type GoalStatus,
  type KinematicChain,
  type Task,
  type WorldState,
} from '@prompower/sim-core';
import { takeGoals } from './goal-ratchet';

/**
 * Ручное задание: ползунки вместо программы.
 *
 * Проверка идёт от текущих углов, а не от итога прогона, — прогонять здесь
 * нечего. Углы, статусы целей и память о взятых считаются одним движением и
 * лежат в одном состоянии: разведённые по разным местам, они требовали бы
 * эффекта, который догоняет проверку, и сверки на каждом проходе, чтобы этот
 * эффект не зациклил отрисовку.
 */
export interface JogTask {
  readonly joints: readonly number[];
  /** Какие цели уже взяты. Взятая назад не отдаётся. */
  readonly taken: readonly boolean[];
  /** Цель, над которой работают сейчас, вместе с тем, чего ей не хватает. */
  readonly activeStatus: GoalStatus | null;
  readonly passed: boolean;
  readonly setJoint: (index: number, radians: number) => void;
  readonly reset: () => void;
}

interface JogState {
  readonly joints: readonly number[];
  readonly taken: readonly boolean[];
}

export function useJogTask(
  chain: KinematicChain,
  task: Task,
  homePose: readonly number[],
): JogTask {
  const start = useMemo(() => [...(task.world.joints ?? homePose)], [task, homePose]);

  // Мир задания собирается один раз: от движения ползунка в нём меняются только
  // углы, а детали, зоны, ленты и датчики остаются теми же.
  const base = useMemo(
    () => createWorld({ ...task.world, joints: start }),
    [task, start],
  );

  const check = useCallback(
    (world: WorldState): readonly GoalStatus[] => checkGoals(task, world, [], chain),
    [task, chain],
  );

  const [state, setState] = useState<JogState>(() => ({
    joints: start,
    taken: task.goals.map(() => false),
  }));

  const statuses = useMemo(
    () => check(setWorldJoints(base, state.joints)),
    [check, base, state.joints],
  );

  const advance = useCallback(
    (joints: readonly number[], taken: readonly boolean[]): JogState => ({
      joints,
      taken: takeGoals(
        taken,
        check(setWorldJoints(base, joints)).map((status) => status.failure === null),
      ),
    }),
    [check, base],
  );

  const active = state.taken.findIndex((value) => !value);

  return {
    joints: state.joints,
    taken: state.taken,
    activeStatus: active === -1 ? null : (statuses[active] ?? null),
    passed: state.taken.length > 0 && state.taken.every(Boolean),
    setJoint: useCallback(
      (index: number, radians: number) => {
        setState((current) =>
          advance(
            current.joints.map((value, i) => (i === index ? radians : value)),
            current.taken,
          ),
        );
      },
      [advance],
    ),
    // Сброс возвращает робота в начало, но не отбирает взятые цели: ученик
    // сбрасывает позу как раз затем, чтобы зайти на следующую цель заново.
    reset: useCallback(
      () => setState((current) => advance(start, current.taken)),
      [advance, start],
    ),
  };
}
