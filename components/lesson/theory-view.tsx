'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * Теория как этап урока.
 *
 * Колонка ограничена по ширине: комфортная строка — 500–700 пикселей, и именно
 * из-за этого теория не могла жить в боковой колонке на 320.
 */
export function TheoryView({ children, onStart }: { children: ReactNode; onStart: () => void }) {
  const t = useTranslations('course');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10">
        {children}

        <button
          type="button"
          data-testid="theory-start"
          onClick={onStart}
          className="self-start rounded-panel border border-brand/50 bg-brand/15 px-4 py-2 text-sm text-ink hover:bg-brand/25"
        >
          {t('startTask')}
        </button>
      </div>
    </div>
  );
}
