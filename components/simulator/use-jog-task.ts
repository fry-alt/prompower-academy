'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkGoals,
  createWorld,
  type GoalStatus,
  type KinematicChain,
  type Task,
} from '@prompower/sim-core';
import { takeGoals } from './goal-ratchet';

/**
 * Ручное задание: ползунки вместо программы.
 *
 * Проверка идёт от текущих углов, а не от итога прогона, — прогонять здесь
 * нечего. Мир собирается заново на каждое движение ползунка: он состоит из
 * задания и шести чисел, и это дешевле, чем держать его в состоянии и следить
 * за его согласованностью с углами.
 */
export interface JogTask {
  readonly joints: readonly number[];
  readonly statuses: readonly GoalStatus[];
  /** Какие цели уже взяты. Взятая назад не отдаётся. */
  readonly taken: readonly boolean[];
  /** Цель, над которой работают сейчас. `null` — задание выполнено. */
  readonly active: number | null;
  readonly passed: boolean;
  readonly setJoint: (index: number, radians: number) => void;
  readonly reset: () => void;
}

export function useJogTask(
  chain: KinematicChain,
  task: Task,
  homePose: readonly number[],
): JogTask {
  const start = useMemo(() => [...(task.world.joints ?? homePose)], [task, homePose]);

  const [joints, setJoints] = useState<readonly number[]>(start);
  const [taken, setTaken] = useState<readonly boolean[]>(() => task.goals.map(() => false));

  const statuses = useMemo(
    () =>
      checkGoals(
        task,
        createWorld({
          joints: [...joints],
          objects: [...task.world.objects],
          zones: [...task.world.zones],
        }),
        [],
        chain,
      ),
    [task, joints, chain],
  );

  // Храповик догоняет проверку. Сравнение с прежним значением обязательно:
  // без него состояние менялось бы каждым проходом и рендер зациклился бы.
  useEffect(() => {
    setTaken((current) => {
      const next = takeGoals(
        current,
        statuses.map((status) => status.failure === null),
      );
      return next.every((value, index) => value === current[index]) ? current : next;
    });
  }, [statuses]);

  const active = taken.findIndex((value) => !value);

  return {
    joints,
    statuses,
    taken,
    active: active === -1 ? null : active,
    passed: taken.length > 0 && taken.every(Boolean),
    setJoint: useCallback((index: number, radians: number) => {
      setJoints((current) => current.map((value, i) => (i === index ? radians : value)));
    }, []),
    // Сброс возвращает робота в начало, но не отбирает взятые цели: ученик
    // сбрасывает позу как раз затем, чтобы зайти на следующую цель заново.
    reset: useCallback(() => setJoints(start), [start]),
  };
}
