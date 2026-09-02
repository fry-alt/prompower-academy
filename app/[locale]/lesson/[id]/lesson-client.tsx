'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { jakaZu7 } from '@prompower/robot-plugins';
import type { Task } from '@prompower/sim-core';

/**
 * three.js и разбор URDF живут только в браузере, поэтому рабочее место урока
 * подгружается на клиенте.
 */
const LessonWorkspace = dynamic(
  () => import('@/components/simulator/lesson-workspace').then((m) => m.LessonWorkspace),
  { ssr: false, loading: () => <Fallback /> },
);

export function LessonClient({ task, starter }: { task: Task; starter: object }) {
  return <LessonWorkspace plugin={jakaZu7} task={task} starter={starter} />;
}

function Fallback() {
  const t = useTranslations('lesson');
  return (
    <div className="grid h-dvh place-items-center bg-surface-0 text-sm text-ink-faint">
      {t('loading')}
    </div>
  );
}
