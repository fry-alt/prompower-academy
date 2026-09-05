'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * Переход по порядку курса. Последний урок честно говорит, что он последний:
 * §9 требует, чтобы пустые состояния были указанием, а не украшением.
 */

/**
 * Сосед по курсу. Объявлен здесь один раз: страница, обёртка и рабочее место
 * передают его друг другу, и три копии этого типа разошлись бы молча.
 */
export interface LessonLink {
  readonly slug: string;
  readonly title: string;
}

export function LessonNav({
  previous,
  next,
}: {
  previous: LessonLink | null;
  next: LessonLink | null;
}) {
  const t = useTranslations('course');

  return (
    <nav data-testid="lesson-nav" className="flex items-center justify-between gap-2 text-sm">
      {previous === null ? (
        <span />
      ) : (
        <Link
          href={`/lesson/${previous.slug}`}
          data-testid="lesson-previous"
          className="text-ink-dim hover:text-ink"
        >
          {t('previous')}
        </Link>
      )}

      {next === null ? (
        <span className="text-ink-faint">{t('lastLesson')}</span>
      ) : (
        <Link
          href={`/lesson/${next.slug}`}
          data-testid="lesson-next"
          className="text-ink hover:text-brand"
        >
          {t('next')}
        </Link>
      )}
    </nav>
  );
}
