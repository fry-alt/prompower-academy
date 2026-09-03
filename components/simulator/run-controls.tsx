'use client';

import { useTranslations } from 'next-intl';
import type { RunStatus } from './use-program-run';

/**
 * Запуск, пауза, шаг, сброс и скорость.
 *
 * Ползунок скорости растягивает анимацию, но не трогает сам прогон: при одной и
 * той же программе результат обязан совпадать бит в бит независимо от того, как
 * быстро на это смотрели.
 */

const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

export function RunControls({
  status,
  speed,
  onPlay,
  onPause,
  onStep,
  onReset,
  onSpeed,
  locked = false,
}: {
  status: RunStatus;
  speed: number;
  /** Показ точки роботу: пока он идёт, прогон трогать нельзя. */
  locked?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeed: (value: number) => void;
}) {
  const t = useTranslations('lesson');
  const finished = status === 'done';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'playing' ? (
        <Button onClick={onPause} testId="pause" primary>
          {t('controls.pause')}
        </Button>
      ) : (
        <Button onClick={onPlay} testId="play" primary disabled={finished || locked}>
          {t('controls.play')}
        </Button>
      )}

      <Button onClick={onStep} testId="step" disabled={finished || locked || status === 'playing'}>
        {t('controls.step')}
      </Button>

      <Button onClick={onReset} testId="reset" disabled={locked}>
        {t('controls.reset')}
      </Button>

      <label className="ml-auto flex items-center gap-2 text-xs text-ink-faint">
        {t('controls.speed')}
        <select
          data-testid="speed"
          value={speed}
          onChange={(event) => onSpeed(Number(event.target.value))}
          className="rounded-panel border border-line bg-surface-1 px-2 py-1 text-ink"
        >
          {SPEEDS.map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Button({
  children,
  onClick,
  testId,
  disabled = false,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-panel border px-3 py-1.5 text-sm transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        primary
          ? 'border-brand/50 bg-brand/15 text-ink hover:bg-brand/25'
          : 'border-line bg-surface-1 text-ink-dim hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
