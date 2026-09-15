'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  checkGoals,
  checkKeepOuts,
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
  /**
   * Нарушенный запрет. Держится, пока его не снимут сбросом: урок, который
   * забывает нарушение, стоит ученику выехать обратно, учит ровно неверному.
   */
  readonly violation: string | null;
  readonly passed: boolean;
  readonly setJoint: (index: number, radians: number) => void;
  readonly reset: () => void;
}

interface JogState {
  readonly joints: readonly number[];
  readonly taken: readonly boolean[];
  readonly violation: string | null;
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
    violation: null,
  }));

  const statuses = useMemo(
    () => check(setWorldJoints(base, state.joints)),
    [check, base, state.joints],
  );

  const advance = useCallback(
    (joints: readonly number[], taken: readonly boolean[], violation: string | null): JogState => {
      const world = setWorldJoints(base, joints);

      return {
        joints,
        taken: takeGoals(
          taken,
          check(world).map((status) => status.failure === null),
        ),
        // Первое нарушение и остаётся: последующие ничего не добавляют, а
        // затирать его новым значит терять то, с чего всё началось.
        violation: violation ?? (checkKeepOuts(task, world, chain)[0] ?? null),
      };
    },
    [check, base, task, chain],
  );

  const active = state.taken.findIndex((value) => !value);

  return {
    joints: state.joints,
    taken: state.taken,
    activeStatus: active === -1 ? null : (statuses[active] ?? null),
    violation: state.violation,
    // Пока нарушение висит, задание не зачтено, даже если все цели взяты.
    passed: state.violation === null && state.taken.length > 0 && state.taken.every(Boolean),
    setJoint: useCallback(
      (index: number, radians: number) => {
        setState((current) =>
          advance(
            current.joints.map((value, i) => (i === index ? radians : value)),
            current.taken,
            current.violation,
          ),
        );
      },
      [advance],
    ),
    // Сброс возвращает робота в начало и снимает нарушение: это и есть
    // выученное действие — вернуться в известное состояние и пройти иначе.
    // Взятые цели при этом остаются: их ученик уже заработал.
    reset: useCallback(
      () => setState((current) => advance(start, current.taken, null)),
      [advance, start],
    ),
  };
}
