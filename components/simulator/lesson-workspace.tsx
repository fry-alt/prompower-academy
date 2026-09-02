'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Program, RobotPlugin, Task } from '@prompower/sim-core';
import { ProgramList } from './program-list';
import { RobotViewer } from './robot-viewer';
import { RunControls } from './run-controls';
import { SceneObjects } from './scene-objects';
import { useProgramRun } from './use-program-run';
import { useUrdfRobot } from './use-urdf-robot';
import { useUrdfChain } from './use-urdf-chain';
import { includeScene } from './fit-robot';

/**
 * Экран задания: условие, программа и сцена.
 *
 * Три зоны из §9 брифа, но пока без редактора блоков: программа приходит готовой
 * и показана списком. Когда появится Blockly, он встанет на место списка — всё
 * остальное уже работает от него независимо.
 */
export function LessonWorkspace({
  plugin,
  task,
  program,
}: {
  plugin: RobotPlugin;
  task: Task;
  program: Program;
}) {
  const t = useTranslations('lesson');
  const tKey = useTranslations();
  const [fps, setFps] = useState(0);

  const model = useUrdfRobot(plugin);
  const chain = useUrdfChain(plugin);

  if (model.status === 'error' || chain.status === 'error') {
    const error = model.status === 'error' ? model.error : (chain as { error: Error }).error;
    return (
      <p data-testid="load-failure" className="p-5 text-sm text-warn">
        {t('loadFailed', { reason: error.message })}
      </p>
    );
  }

  if (model.status === 'loading' || chain.status === 'loading') {
    return <p className="p-5 text-sm text-ink-faint">{t('loading')}</p>;
  }

  return (
    <Workspace
      plugin={plugin}
      task={task}
      program={program}
      model={model}
      chain={chain.chain}
      fps={fps}
      onFps={setFps}
      labels={{ t, tKey }}
    />
  );
}

type Loaded = Extract<ReturnType<typeof useUrdfRobot>, { status: 'ready' }>;
type Chain = Extract<ReturnType<typeof useUrdfChain>, { status: 'ready' }>['chain'];

/**
 * Внутренний компонент нужен, чтобы хук прогона вызывался только с готовой
 * цепью: хуки нельзя звать условно, а цепь приходит асинхронно.
 */
function Workspace({
  plugin,
  task,
  program,
  model,
  chain,
  fps,
  onFps,
  labels,
}: {
  plugin: RobotPlugin;
  task: Task;
  program: Program;
  model: Loaded;
  chain: Chain;
  fps: number;
  onFps: (value: number) => void;
  labels: { t: ReturnType<typeof useTranslations<'lesson'>>; tKey: ReturnType<typeof useTranslations> };
}) {
  const { t, tKey } = labels;
  const runner = useProgramRun(chain, program, task, plugin.homePose);

  // Кадр строится по роботу вместе с деталями и зонами: иначе задание окажется
  // за краем экрана, а ученику надо видеть, куда он перекладывает деталь.
  const bounds = useMemo(
    () => includeScene(model.bounds, [...task.world.objects, ...task.world.zones]),
    [model.bounds, task],
  );

  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h1 className="text-base font-medium">{t('title')}</h1>
          <p className="text-sm text-ink-dim">{tKey(plugin.displayNameKey)}</p>
        </div>
        <RunControls
          status={runner.status}
          speed={runner.speed}
          onPlay={runner.play}
          onPause={runner.pause}
          onStep={runner.stepOnce}
          onReset={runner.reset}
          onSpeed={runner.setSpeed}
        />
      </header>

      {plugin.placeholderNoticeKey !== null && (
        <p role="status" className="border-b border-line bg-surface-1 px-5 py-2 text-sm text-warn">
          {tKey(plugin.placeholderNoticeKey)}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-b border-line p-5 lg:w-96 lg:border-b-0 lg:border-r">
          <section>
            <h2 className="mb-2 text-sm font-medium">{t('goals')}</h2>
            <ul className="flex flex-col gap-1 text-sm text-ink-dim">
              {task.goals.map((goal, index) => (
                <li key={index}>
                  {goal.type === 'objectInZone'
                    ? t('goal.objectInZone', { object: goal.object, zone: goal.zone })
                    : t('goal.gripperState', { state: t(`gripper.${goal.state}`) })}
                </li>
              ))}
            </ul>
          </section>

          <section className="min-h-0">
            <h2 className="mb-2 text-sm font-medium">{t('program')}</h2>
            <ProgramList program={program} current={runner.run.current} />
          </section>

          <Verdict runner={runner} t={t} />
        </aside>

        <main className="relative min-h-0 flex-1">
          <RobotViewer
            robot={model.robot}
            jointNames={plugin.joints.map((joint) => joint.urdfName)}
            values={runner.joints}
            scene={plugin.scene}
            bounds={bounds}
            onFpsSample={onFps}
          >
            <SceneObjects
              objects={runner.run.world.objects}
              zones={runner.run.world.zones}
              heldId={runner.run.world.grasped}
            />
          </RobotViewer>

          <p
            data-testid="scene-stats"
            className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs text-ink-faint"
          >
            <span data-testid="load-ms">{model.loadMs}</span> ms · {fps} fps
          </p>
        </main>
      </div>
    </div>
  );
}

/** Итог прогона: ошибка исполнения либо результат автопроверки. */
function Verdict({
  runner,
  t,
}: {
  runner: ReturnType<typeof useProgramRun>;
  t: ReturnType<typeof useTranslations<'lesson'>>;
}) {
  if (runner.run.error !== null) {
    return (
      <p data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-warn">
        {runner.run.error}
      </p>
    );
  }

  if (runner.status !== 'done' || runner.check === null) return null;

  if (runner.check.passed) {
    return (
      <p data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-ok">
        {t('passed')}
      </p>
    );
  }

  return (
    <div data-testid="verdict" className="rounded-panel bg-surface-1 p-3 text-sm text-warn">
      <p className="mb-1 font-medium">{t('failed')}</p>
      <ul className="flex flex-col gap-1">
        {runner.check.failures.map((failure) => (
          <li key={failure}>{failure}</li>
        ))}
      </ul>
    </div>
  );
}
