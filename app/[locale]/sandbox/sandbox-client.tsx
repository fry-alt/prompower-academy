'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { jaka6Dof } from '@prompower/robot-jaka-6dof';

/**
 * urdf-loader разбирает XML через DOMParser, а three.js создаёт контекст WebGL —
 * ни то, ни другое не существует на сервере, поэтому песочница грузится только
 * в браузере.
 */
const SimulatorSandbox = dynamic(
  () => import('@/components/simulator/simulator-sandbox').then((m) => m.SimulatorSandbox),
  { ssr: false, loading: () => <SandboxFallback /> },
);

export function SandboxClient() {
  return <SimulatorSandbox plugin={jaka6Dof} />;
}

function SandboxFallback() {
  const t = useTranslations('sandbox');
  return (
    <div className="grid h-dvh place-items-center bg-surface-0 text-sm text-ink-faint">
      {t('loading')}
    </div>
  );
}
