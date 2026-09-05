'use client';

import type { ReactNode } from 'react';

/**
 * Шапка урока: что за урок и на каком роботе.
 *
 * Одна на оба вида экрана — широкий с рабочим местом и узкий с отказом, — а
 * управление прогоном приходит потомком: на телефоне управлять нечем.
 */
export function LessonHeader({
  title,
  model,
  children,
}: {
  title: string;
  model: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        {/* Заголовок из содержания, а не из переводов: у каждого урока свой. */}
        <h1 className="text-base font-medium">{title}</h1>
        <p className="text-sm text-ink-dim">{model}</p>
      </div>

      {children}
    </header>
  );
}
