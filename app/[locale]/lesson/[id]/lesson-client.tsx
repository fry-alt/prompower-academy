'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { jakaZu7 } from '@prompower/robot-plugins';
import type { Task } from '@prompower/sim-core';
import type { LessonLink } from '@/components/lesson/lesson-nav';
import type { Tour } from '@/lib/tour';

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
  tour,
  starter,
  title,
  theory,
  previous,
  next,
}: {
  task: Task;
  /** Сценарий обучения урока: подсветка кнопок. Урока без него — обычное дело. */
  tour: Tour | null;
  starter: object;
  /** Заголовок урока из содержания: шапке нужна строка, а не готовый узел. */
  title: string;
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
      tour={tour}
      starter={starter}
      title={title}
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
