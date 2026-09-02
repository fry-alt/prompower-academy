'use client';

import { useTranslations } from 'next-intl';
import type { RobotPlugin } from '@prompower/sim-core';
import { useRouter } from '@/i18n/navigation';

/**
 * Выбор модели кобота.
 *
 * Модель живёт в адресе, а не в состоянии компонента: ссылку на конкретного
 * робота можно отправить коллеге, а страницы всех моделей собираются статически.
 */
export function RobotPicker({
  plugins,
  currentId,
}: {
  plugins: readonly RobotPlugin[];
  currentId: string;
}) {
  const t = useTranslations('sandbox');
  const tKey = useTranslations();
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-faint">{t('robotLabel')}</span>
      <select
        data-testid="robot-picker"
        value={currentId}
        onChange={(event) => router.push(`/sandbox/${event.target.value}`)}
        className="rounded-panel border border-line bg-surface-1 px-2 py-1 text-ink"
      >
        {plugins.map((plugin) => (
          <option key={plugin.id} value={plugin.id}>
            {tKey(plugin.displayNameKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
