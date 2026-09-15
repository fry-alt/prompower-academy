'use client';

import { useMemo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { URDFRobot } from 'urdf-loader';
import { jointLimits, type KinematicChain, type RobotPlugin, type Task } from '@prompower/sim-core';
import { LessonBrief, LessonShell } from '@/components/lesson/lesson-shell';
import type { LessonLink } from '@/components/lesson/lesson-nav';
import { TaskBrief } from '@/components/lesson/task-brief';
import type { Tour } from '@/lib/tour';
import type { RobotBounds } from './fit-robot';
import { GhostRobot } from './ghost-robot';
import { JointPanel } from './joint-panel';
import { KeepOutZone } from './keep-out-zone';
import { RobotViewer } from './robot-viewer';
import { TargetPoint } from './target-point';
import { taskBounds } from './task-bounds';
import { useJogTask } from './use-jog-task';

/**
 * Урок без программы: робота ведут ползунками.
 *
 * Отдельный компонент, а не ветка внутри урока с блоками: хук прогона и хук
 * ручного задания нельзя звать условно, а вызывать оба ради одного значит
 * поднимать интерпретатор там, где исполнять нечего. Всё, что у двух уроков
 * общего, — в `LessonShell`; здесь остаётся то, чем они отличаются.
 */
export function JogLesson({
  plugin,
  task,
  tour,
  title,
  theory,
  previous,
  next,
  robot,
  chain,
  bounds,
  loadMs,
  onFps,
  fps,
}: {
  plugin: RobotPlugin;
  task: Task;
  tour: Tour | null;
  title: string;
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
  robot: URDFRobot;
  chain: KinematicChain;
  bounds: RobotBounds;
  loadMs: number;
  onFps: (value: number) => void;
  fps: number;
}) {
  const t = useTranslations('lesson');

  const jog = useJogTask(chain, task, plugin.homePose);
  const limits = useMemo(() => jointLimits(chain), [chain]);
  const jointNames = useMemo(() => plugin.joints.map((joint) => joint.urdfName), [plugin]);

  // Подсказка активной цели в сцене: поза показывается серой копией, точка —
  // меткой. Взятая цель со сцены уходит: показывать в ней больше нечего.
  const active = jog.activeStatus?.goal ?? null;

  const framed = useMemo(() => taskBounds(bounds, task), [bounds, task]);

  // Запретные зоны берутся из ограничений: зона, на которую никто не ссылается,
  // в сцене и не нужна.
  const keepOut = useMemo(
    () =>
      task.constraints.flatMap((constraint) =>
        constraint.type === 'keepOut'
          ? task.world.zones.filter((zone) => zone.id === constraint.zone)
          : [],
      ),
    [task],
  );

  return (
    <LessonShell
      plugin={plugin}
      title={title}
      theory={theory}
      previous={previous}
      next={next}
      tour={tour}
      passed={jog.passed}
      loadMs={loadMs}
      fps={fps}
      controls={
        <button
          type="button"
          data-testid="reset"
          onClick={jog.reset}
          className="rounded-panel border border-line bg-surface-1 px-3 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          {t('controls.reset')}
        </button>
      }
      left={
        <>
          <LessonBrief>
            <TaskBrief
              task={task}
              check={jog.passed ? PASSED : null}
              error={null}
              taken={jog.taken}
              activeFailure={jog.activeStatus?.failure ?? null}
              violation={jog.violation}
              failedAttempts={0}
            />
          </LessonBrief>

          <div data-testid="joint-panel" className="min-h-0 flex-1 overflow-y-auto p-5">
            <h2 className="mb-1 text-sm font-medium">{t('jog.title')}</h2>
            <p className="mb-4 text-sm text-ink-faint">{t('jog.hint')}</p>

            <JointPanel
              joints={plugin.joints}
              limits={limits}
              values={jog.joints}
              onChange={jog.setJoint}
            />
          </div>
        </>
      }
      viewer={
        <RobotViewer
          robot={robot}
          jointNames={jointNames}
          values={jog.joints}
          scene={plugin.scene}
          bounds={framed}
          onFpsSample={onFps}
        >
          {keepOut.map((zone) => (
            <KeepOutZone key={zone.id} zone={zone} />
          ))}

          {active?.type === 'jointsAtPose' && (
            <GhostRobot source={robot} jointNames={jointNames} values={active.joints} />
          )}

          {active?.type === 'flangeAtPoint' && (
            <TargetPoint point={active.point} radius={active.tolerance} />
          )}
        </RobotViewer>
      }
    />
  );
}

/**
 * Итог ручного задания: взяты все цели.
 *
 * Провалов в нём не бывает — невыполненная цель объясняет себя сама, строкой
 * под списком, и до общего вердикта дело не доходит.
 */
const PASSED = { passed: true, failures: [] } as const;
