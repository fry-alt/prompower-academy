import type { ReactNode } from 'react';

/**
 * Оформление теории урока.
 *
 * MDX собран на сервере и приходит готовым узлом. Здесь только типографика:
 * узкая колонка, спокойный ритм, читаемость часами подряд — §9 просит
 * ориентироваться на промышленные интерфейсы, а не на лендинги.
 */
export function LessonTheory({ children }: { children: ReactNode }) {
  return (
    <article className="flex flex-col gap-3">
      {/* Заголовка здесь нет: его показывает шапка урока, и на экране теории он
          дублировался бы сам с собой. */}
      <div className="flex flex-col gap-4 text-[0.9375rem] leading-relaxed text-ink-dim [&_a]:text-brand [&_a]:underline [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-ink [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-ink [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </div>
    </article>
  );
}
