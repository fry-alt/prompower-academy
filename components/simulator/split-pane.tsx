'use client';

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/**
 * Две зоны и разделитель между ними.
 *
 * Во время перетаскивания доля пишется прямо в стиль, а в состояние React
 * попадает один раз по отпусканию: в правой зоне холст three.js, и
 * перерисовывать его на каждое движение указателя дорого.
 *
 * Свои полсотни строк вместо зависимости: поведение здесь простое, а лишний
 * пакет при нестабильном реестре — лишний риск.
 */

const MIN_FRACTION = 0.25;
const MAX_FRACTION = 0.75;
const KEYBOARD_STEP = 0.02;

function clamp(value: number): number {
  return Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, value));
}

export function SplitPane({
  left,
  right,
  label,
  initial = 0.5,
}: {
  left: ReactNode;
  right: ReactNode;
  /** Подпись разделителя: он управляется и с клавиатуры. */
  label: string;
  initial?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const leftPane = useRef<HTMLDivElement>(null);
  const latest = useRef(initial);
  const [fraction, setFraction] = useState(initial);

  const drag = useCallback((clientX: number): void => {
    const box = container.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return;

    const next = clamp((clientX - box.left) / box.width);
    latest.current = next;
    if (leftPane.current !== null) leftPane.current.style.flexBasis = `${next * 100}%`;
  }, []);

  const start = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();

    const move = (moved: PointerEvent): void => drag(moved.clientX);
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      setFraction(latest.current);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  const nudge = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();

    const step = event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP;
    const next = clamp(latest.current + step);
    latest.current = next;
    setFraction(next);
  };

  return (
    <div ref={container} className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        ref={leftPane}
        style={{ flexBasis: `${fraction * 100}%` }}
        className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-line lg:flex-none lg:border-b-0"
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={Math.round(MIN_FRACTION * 100)}
        aria-valuemax={Math.round(MAX_FRACTION * 100)}
        tabIndex={0}
        data-testid="split-handle"
        onPointerDown={start}
        onKeyDown={nudge}
        className="hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-line transition-colors hover:bg-brand focus-visible:bg-brand lg:block"
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{right}</div>
    </div>
  );
}
