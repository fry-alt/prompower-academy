'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Честный ответ вместо задания на узком экране.
 *
 * §9 брифа: «Блочный редактор на телефоне бесполезен, не притворяйся, что это
 * не так». Складывать сцену, редактор и панель показа точки в колонку на 360
 * пикселей — как раз такое притворство: собрать программу там нельзя, а модель
 * робота телефон уже скачал.
 *
 * Адрес урока показан рядом: перенести задание на компьютер иначе нечем, пока в
 * продукте нет ни аккаунтов, ни почты.
 */
export function TaskOnDesktop({ onBack }: { onBack: () => void }) {
  const t = useTranslations('lesson');
  // Рабочее место грузится с `ssr: false`, но проверка стоит: цена ей — строка,
  // а «window без проверки» ломает сборку целиком.
  const [address] = useState(() => (typeof window === 'undefined' ? '' : window.location.href));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 py-10">
        <h2 data-testid="desktop-only" className="text-base font-medium">
          {t('desktopOnly.title')}
        </h2>

        <p className="text-sm text-ink-dim">{t('desktopOnly.text')}</p>

        <p className="rounded-panel bg-surface-1 p-3 font-mono text-xs break-all text-ink-dim">
          {address}
        </p>

        <button
          type="button"
          data-testid="desktop-only-back"
          onClick={onBack}
          className="self-start rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
        >
          {t('desktopOnly.back')}
        </button>
      </div>
    </div>
  );
}
