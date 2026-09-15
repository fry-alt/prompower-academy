'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { URDFRobot } from 'urdf-loader';
import { jointLimits, type KinematicChain, type RobotPlugin, type Task } from '@prompower/sim-core';
import { GuidedTour } from '@/components/lesson/guided-tour';
import { LessonHeader } from '@/components/lesson/lesson-header';
import { LessonNav, type LessonLink } from '@/components/lesson/lesson-nav';
import { TaskBrief } from '@/components/lesson/task-brief';
import { TheoryView } from '@/components/lesson/theory-view';
import type { Tour } from '@/lib/tour';
import type { RobotBounds } from './fit-robot';
import { GhostRobot } from './ghost-robot';
import { JointPanel } from './joint-panel';
import { RobotViewer } from './robot-viewer';
import { SplitPane } from './split-pane';
import { TargetPoint } from './target-point';
import { useJogTask } from './use-jog-task';

/**
 * Урок без программы: робота ведут ползунками.
 *
 * Отдельный компонент, а не ветка внутри урока с блоками: хук прогона и хук
 * ручного задания нельзя звать условно, а вызывать оба ради одного значит
 * поднимать интерпретатор там, где исполнять нечего.
 *
 * Сборка экрана повторяет программный урок — шапка, этап теории, две зоны.
 * Повторяются сборки, а не логика: и шапка, и теория, и разделитель давно
 * вынесены в свои компоненты.
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
  onFps: (value: number) => void;
  fps: number;
}) {
  const t = useTranslations('lesson');
  const tKey = useTranslations();
  const tCourse = useTranslations('course');

  const [reading, setReading] = useState(true);
  const [touring, setTouring] = useState(tour !== null);

  const jog = useJogTask(chain, task, plugin.homePose);
  const limits = useMemo(() => jointLimits(chain), [chain]);
  const jointNames = useMemo(() => plugin.joints.map((joint) => joint.urdfName), [plugin]);

  // Подсказка активной цели в сцене: поза показывается серой копией, точка —
  // меткой. Взятая цель со сцены уходит: показывать в ней больше нечего.
  const active = jog.active === null ? null : (jog.statuses[jog.active]?.goal ?? null);

  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <LessonHeader title={title} model={tKey(plugin.displayNameKey)}>
        {tour !== null && !touring && (
          <button
            type="button"
            data-testid="tour-restart"
            onClick={() => setTouring(true)}
            className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
          >
            {t('tour.restart')}
          </button>
        )}

        {!reading && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="back-to-theory"
              onClick={() => setReading(true)}
              className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              {tCourse('backToTheory')}
            </button>

            <button
              type="button"
              data-testid="reset"
              onClick={jog.reset}
              className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              {t('controls.reset')}
            </button>
          </div>
        )}
      </LessonHeader>

      {plugin.placeholderNoticeKey !== null && (
        <p role="status" className="border-b border-line bg-surface-1 px-5 py-2 text-sm text-warn">
          {tKey(plugin.placeholderNoticeKey)}
        </p>
      )}

      {reading ? (
        <>
          <TheoryView onStart={() => setReading(false)}>{theory}</TheoryView>
          <div className="border-t border-line px-5 py-3">
            <LessonNav previous={previous} next={next} />
          </div>
        </>
      ) : (
        <SplitPane
          label={tCourse('splitLabel')}
          initial={0.42}
          left={
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-line p-5">
                <TaskBrief
                  task={task}
                  check={jog.passed ? { passed: true, failures: [] } : null}
                  error={null}
                  taken={jog.taken}
                  failedAttempts={0}
                />
              </div>

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
            </div>
          }
          right={
            <main className="relative min-h-0 flex-1">
              <RobotViewer
                robot={robot}
                jointNames={jointNames}
                values={jog.joints}
                scene={plugin.scene}
                bounds={bounds}
                onFpsSample={onFps}
              >
                {active?.type === 'jointsAtPose' && (
                  <GhostRobot source={robot} jointNames={jointNames} values={active.joints} />
                )}

                {active?.type === 'flangeAtPoint' && (
                  <TargetPoint point={active.point} radius={active.tolerance} />
                )}
              </RobotViewer>

              {/* Виньетка: сцена перестаёт выглядеть вырезанной в пустоте. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,transparent_45%,rgba(0,0,0,0.5)_100%)]"
              />

              <p
                data-testid="scene-stats"
                className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs text-ink-faint"
              >
                {fps} fps
              </p>
            </main>
          }
        />
      )}

      {tour !== null && touring && (
        <GuidedTour
          tour={tour}
          program={{ version: 1, body: [] }}
          passed={jog.passed}
          onClose={() => setTouring(false)}
        />
      )}
    </div>
  );
}
