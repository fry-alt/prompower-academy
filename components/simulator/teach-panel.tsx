'use client';

import { useTranslations } from 'next-intl';
import {
  flangePose,
  type JointDescriptor,
  type JointLimit,
  type KinematicChain,
} from '@prompower/sim-core';
import { JointPanel } from './joint-panel';
import type { SeedNote } from './teach-pose';

/**
 * Панель показа точки: то же ручное управление, что на планшете JAKA, только
 * двигает оно серую копию, а не робота.
 */

const MM = 1000;

export function TeachPanel({
  joints,
  limits,
  chain,
  values,
  note,
  onChange,
  onSave,
  onCancel,
}: {
  joints: readonly JointDescriptor[];
  limits: readonly JointLimit[];
  chain: KinematicChain;
  values: readonly number[];
  /** Что стало с записанной точкой: об этом надо сказать человеку. */
  note: SeedNote;
  onChange: (index: number, radians: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('lesson');
  const pose = flangePose(chain, values);

  return (
    <section data-testid="teach-panel" className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium">{t('teach.title')}</h2>
        <p className="mt-1 text-sm text-ink-dim">{t(`teach.hint.${note}`)}</p>
      </div>

      <p data-testid="teach-flange" className="font-mono text-xs tabular-nums text-ink-faint">
        {t('teach.flange')} X {Math.round(pose.x * MM)} Y {Math.round(pose.y * MM)} Z{' '}
        {Math.round(pose.z * MM)}
      </p>

      <JointPanel joints={joints} limits={limits} values={values} onChange={onChange} />

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="teach-save"
          onClick={onSave}
          className="rounded-panel bg-brand px-3 py-1.5 text-sm text-surface-0"
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
