'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  assertRobotPluginConsistent,
  clampJointVector,
  type RobotPlugin,
} from '@prompower/sim-core';
import { JointPanel } from './joint-panel';
import { RobotViewer } from './robot-viewer';
import { useUrdfRobot } from './use-urdf-robot';

/**
 * Песочница фазы 1: модель робота и шесть ползунков.
 *
 * Единственный источник истины по позе — состояние `pose` здесь. Сцена его не
 * дублирует, а зажим в пределы делается на чтении, поэтому в три.js никогда не
 * уходит значение вне пределов URDF.
 */
export function SimulatorSandbox({ plugin }: { plugin: RobotPlugin }) {
  const t = useTranslations('sandbox');
  const tKey = useTranslations();
  const [pose, setPose] = useState<number[]>(() => [...plugin.homePose]);
  const [fps, setFps] = useState<number | null>(null);

  const configError = useMemo(() => {
    try {
      assertRobotPluginConsistent(plugin);
      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }, [plugin]);

  const load = useUrdfRobot(plugin);
  const limits = load.status === 'ready' ? load.limits : null;
  const clamped = limits === null ? pose : clampJointVector(limits, pose);
  const jointNames = useMemo(() => plugin.joints.map((joint) => joint.urdfName), [plugin]);

  let scene: React.ReactNode;
  if (configError !== null) {
    scene = <LoadFailure message={configError.message} url={plugin.urdfUrl} />;
  } else if (load.status === 'error') {
    scene = <LoadFailure message={load.error.message} url={plugin.urdfUrl} />;
  } else if (load.status === 'loading') {
    scene = (
      <p className="absolute inset-0 grid place-items-center text-sm text-ink-faint">
        {t('loading')}
      </p>
    );
  } else {
    scene = (
      <RobotViewer
        robot={load.robot}
        jointNames={jointNames}
        values={clamped}
        scene={plugin.scene}
        onFpsSample={setFps}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-surface-0">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-5 py-3">
        <h1 className="text-base font-medium text-ink">{t('title')}</h1>
        <p className="text-sm text-ink-dim">{tKey(plugin.displayNameKey)}</p>
      </header>

      {plugin.isPlaceholder && (
        <p
          role="status"
          data-testid="placeholder-notice"
          className="border-b border-line bg-surface-1 px-5 py-2 text-sm text-warn"
        >
          {t('placeholderNotice')}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(20rem,1fr)_auto] lg:grid-cols-[1fr_21rem] lg:grid-rows-1">
        <section className="relative min-h-0 bg-surface-0" aria-label={t('title')}>
          {scene}
        </section>

        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-line px-5 py-4 lg:border-l lg:border-t-0">
          <div>
            <h2 className="text-sm font-medium text-ink">{t('jointsHeading')}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <PoseButton onClick={() => setPose([...plugin.homePose])}>{t('resetPose')}</PoseButton>
              <PoseButton onClick={() => setPose(plugin.joints.map(() => 0))}>
                {t('zeroPose')}
              </PoseButton>
            </div>
          </div>

          {limits !== null && (
            <JointPanel
              joints={plugin.joints}
              limits={limits}
              values={clamped}
              onChange={(index, radians) =>
                setPose((current) => current.map((v, i) => (i === index ? radians : v)))
              }
            />
          )}

          {load.status === 'ready' && (
            <p
              data-testid="scene-stats"
              className="mt-auto pt-2 font-mono text-[0.6875rem] tabular-nums text-ink-faint"
            >
              <span data-testid="load-ms">{load.loadMs}</span> ms · {fps ?? '—'} fps
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function PoseButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-panel border border-line px-2.5 py-1 text-xs whitespace-nowrap text-ink-dim hover:border-brand hover:text-ink"
    >
      {children}
    </button>
  );
}

function LoadFailure({ message, url }: { message: string; url: string }) {
  const t = useTranslations('sandbox');
  return (
    <div role="alert" data-testid="load-failure" className="grid h-full place-items-center p-6">
      <div className="max-w-md">
        <h2 className="text-sm font-medium text-warn">{t('loadFailedTitle')}</h2>
        <p className="mt-2 text-sm text-ink-dim">{t('loadFailedHint', { url })}</p>
        <pre className="mt-3 overflow-x-auto rounded-panel border border-line bg-surface-1 p-3 font-mono text-xs text-ink-faint">
          {message}
        </pre>
      </div>
    </div>
  );
}
