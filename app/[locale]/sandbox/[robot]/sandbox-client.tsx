'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { getRobotPlugin, robotPlugins } from '@prompower/robot-plugins';

/**
 * urdf-loader разбирает XML через DOMParser, а three.js создаёт контекст WebGL —
 * ни то, ни другое не существует на сервере, поэтому песочница грузится только
 * в браузере.
 */
const SimulatorSandbox = dynamic(
  () => import('@/components/simulator/simulator-sandbox').then((m) => m.SimulatorSandbox),
  { ssr: false, loading: () => <SandboxFallback /> },
);

export function SandboxClient({ robotId }: { robotId: string }) {
  const plugin = getRobotPlugin(robotId);
  if (plugin === undefined) return null;

  return <SimulatorSandbox plugin={plugin} plugins={robotPlugins} />;
}

function SandboxFallback() {
  const t = useTranslations('sandbox');
  return (
    <div className="grid h-dvh place-items-center bg-surface-0 text-sm text-ink-faint">
      {t('loading')}
    </div>
  );
}
