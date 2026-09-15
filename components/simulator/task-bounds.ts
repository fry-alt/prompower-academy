import type { Task } from '@prompower/sim-core';
import { includeScene, type RobotBounds } from './fit-robot';

/**
 * Кадр, в который попадает вся рабочая область задания.
 *
 * По одному роботу кадр строить нельзя: деталь, зона или метка цели лежат в
 * стороне от него, и ученик их просто не увидит. Что именно должно попасть в
 * кадр, решается здесь один раз для обоих видов уроков — иначе задание с
 * деталью и меткой сразу не закадрирует ни одна из веток.
 */
export function taskBounds(bounds: RobotBounds, task: Task): RobotBounds {
  const targets = task.goals.flatMap((goal) =>
    goal.type === 'flangeAtPoint'
      ? [
          {
            position: goal.point,
            size: { x: goal.tolerance * 2, y: goal.tolerance * 2, z: goal.tolerance * 2 },
          },
        ]
      : [],
  );

  return includeScene(bounds, [...task.world.objects, ...task.world.zones, ...targets]);
}
