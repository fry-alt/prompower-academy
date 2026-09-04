'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { jointLimits, type JointDescriptor, type KinematicChain } from '@prompower/sim-core';
import { fieldsFromJoints, type SeedNote } from '@prompower/blocks';
import { JointPanel } from './joint-panel';

/**
 * Панель показа точки: то же ручное управление, что на планшете JAKA, только
 * двигает оно серую копию, а не робота.
 */

export function TeachPanel({
  joints,
  chain,
  values,
  note,
  onChange,
  onSave,
  onCancel,
}: {
  joints: readonly JointDescriptor[];
  chain: KinematicChain;
  values: readonly number[];
  /** Что стало с записанной точкой: об этом надо сказать человеку. */
  note: SeedNote;
  onChange: (index: number, radians: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('lesson');

  // Пределы ползунков — те же, по которым зажимается показанная поза: два
  // разбора одного URDF разошлись бы молча, и ползунок разрешил бы недоступное.
  const limits = useMemo(() => jointLimits(chain), [chain]);

  // Ровно те числа, которые уедут в блок по «Сохранить». Считать их здесь
  // отдельно значило бы показывать одно, а записывать другое.
  const flange = useMemo(() => fieldsFromJoints('pose', values, chain), [values, chain]);

  return (
    <section data-testid="teach-panel" className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium">{t('teach.title')}</h2>
        <p className="mt-1 text-sm text-ink-dim">{t(`teach.hint.${note}`)}</p>
      </div>

      <p data-testid="teach-flange" className="font-mono text-xs tabular-nums text-ink-faint">
        {t('teach.flange')} X {flange.X} Y {flange.Y} Z {flange.Z}
      </p>

      <JointPanel joints={joints} limits={limits} values={values} onChange={onChange} />

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="teach-save"
          onClick={onSave}
          className="rounded-panel border border-brand/50 bg-brand/15 px-3 py-1.5 text-sm text-ink hover:bg-brand/25"
        >
          {t('teach.save')}
        </button>
        <button
          type="button"
          data-testid="teach-cancel"
          onClick={onCancel}
          className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
        >
          {t('teach.cancel')}
        </button>
      </div>
    </section>
  );
}
