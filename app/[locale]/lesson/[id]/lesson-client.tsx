'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { jakaZu7 } from '@prompower/robot-plugins';
import type { Task } from '@prompower/sim-core';
import type { LessonLink } from '@/components/lesson/lesson-nav';

/**
 * three.js и разбор URDF живут только в браузере, поэтому рабочее место урока
 * подгружается на клиенте.
 */
const LessonWorkspace = dynamic(
  () => import('@/components/simulator/lesson-workspace').then((m) => m.LessonWorkspace),
  { ssr: false, loading: () => <Fallback /> },
);

export function LessonClient({
  task,
  starter,
  theory,
  previous,
  next,
}: {
  task: Task;
  starter: object;
  /**
   * Готовый узел с сервера: рабочее место грузится с `ssr: false` и собрать
   * MDX у себя не может.
   */
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
}) {
  return (
    <LessonWorkspace
      plugin={jakaZu7}
      task={task}
      starter={starter}
      theory={theory}
      previous={previous}
      next={next}
    />
  );
}

function Fallback() {
  const t = useTranslations('lesson');
  return (
    <div className="grid h-dvh place-items-center bg-surface-0 text-sm text-ink-faint">
      {t('loading')}
    </div>
  );
}
