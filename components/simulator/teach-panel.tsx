'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  jointLimits,
  type JogAxis,
  type JogFrame,
  type JointDescriptor,
  type KinematicChain,
  type Pose,
} from '@prompower/sim-core';
import { fieldsFromJoints, type SeedNote } from '@prompower/blocks';
import { CartesianPanel } from './cartesian-panel';
import { JointPanel } from './joint-panel';

/**
 * Панель показа точки: ручное управление, двигающее серую копию, а не робота.
 *
 * Две вкладки повторяют экран ручного управления промышленного пульта: суставы
 * по отдельности и поза фланца в координатах.
 */

/** Что стало с позой копии. `blocked` — последний шаг не прошёл. */
export type TeachNote = SeedNote | 'blocked';

type Tab = 'joints' | 'cartesian';

export function TeachPanel({
  joints,
  chain,
  values,
  note,
  onChange,
  onJog,
  onPose,
  onAlignDown,
  onSave,
  onCancel,
}: {
  joints: readonly JointDescriptor[];
  chain: KinematicChain;
  values: readonly number[];
  /** Что стало с записанной точкой: об этом надо сказать человеку. */
  note: TeachNote;
  onChange: (index: number, radians: number) => void;
  /** Возвращает false, если дальше не достаём: удержание на этом встаёт. */
  onJog: (frame: JogFrame, axis: JogAxis, delta: number) => boolean;
  onPose: (pose: Pose) => void;
  onAlignDown: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('lesson');
  const [tab, setTab] = useState<Tab>('joints');

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

      <div className="flex gap-1">
        {(['joints', 'cartesian'] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`teach-tab-${option}`}
            aria-pressed={tab === option}
            onClick={() => setTab(option)}
            className={
              tab === option
                ? 'rounded-panel border border-brand/50 bg-brand/15 px-2 py-1 text-xs text-ink'
                : 'rounded-panel border border-line px-2 py-1 text-xs text-ink-dim hover:text-ink'
            }
          >
            {t(`teach.tab.${option}`)}
          </button>
        ))}
      </div>

      {tab === 'joints' ? (
        <JointPanel joints={joints} limits={limits} values={values} onChange={onChange} />
      ) : (
        <CartesianPanel
          chain={chain}
          values={values}
          onJog={onJog}
          onPose={onPose}
          onAlignDown={onAlignDown}
        />
      )}

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
