'use client';

import { useTranslations } from 'next-intl';
import type { JointDescriptor, JointLimit } from '@prompower/sim-core';
import { displayRange, formatValue, fromDisplay, isAngular, toDisplay } from './joint-display';

/** Ползунок ходит с шагом 0.5°, поэтому «упёрся в предел» считаем с запасом. */
const LIMIT_EPSILON = 1e-4;

interface JointPanelProps {
  joints: readonly JointDescriptor[];
  limits: readonly JointLimit[];
  values: readonly number[];
  onChange: (index: number, radians: number) => void;
}

export function JointPanel({ joints, limits, values, onChange }: JointPanelProps) {
  const t = useTranslations('sandbox');
  const tKey = useTranslations();

  return (
    <ul className="flex flex-col gap-5">
      {limits.map((limit, index) => {
        const descriptor = joints[index];
        if (descriptor === undefined) return null;

        const value = values[index] ?? 0;
        const range = displayRange(limit);
        const unit = isAngular(limit) ? t('degreesUnit') : t('metresUnit');
        const inputId = `joint-${limit.name}`;
        const atLower = limit.type !== 'continuous' && value - limit.lower < LIMIT_EPSILON;
        const atUpper = limit.type !== 'continuous' && limit.upper - value < LIMIT_EPSILON;

        return (
          <li key={limit.name}>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={inputId} className="text-sm text-ink">
                {tKey(descriptor.labelKey)}
              </label>
              <output
                htmlFor={inputId}
                data-joint-value={limit.name}
                className="font-mono text-sm tabular-nums text-ink-dim"
              >
                {formatValue(limit, value)}
                {unit}
              </output>
            </div>

            <input
              id={inputId}
              data-joint={limit.name}
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={toDisplay(limit, value)}
              onChange={(event) => onChange(index, fromDisplay(limit, event.target.valueAsNumber))}
              className="mt-2 w-full accent-brand"
            />

            <div className="mt-1 flex justify-between font-mono text-[0.6875rem] tabular-nums">
              <span className={atLower ? 'text-warn' : 'text-ink-faint'}>
                {atLower ? t('atLowerLimit') : `${range.min}${unit}`}
              </span>
              <span className={atUpper ? 'text-warn' : 'text-ink-faint'}>
                {atUpper ? t('atUpperLimit') : `${range.max}${unit}`}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
