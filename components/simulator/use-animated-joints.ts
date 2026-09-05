'use client';

import { useEffect, useRef, useState } from 'react';
import { easeInOut, interpolateJoints, motionDuration } from './joint-motion';

/**
 * Ведёт показываемую позу к целевой.
 *
 * Целевая поза остаётся логической правдой — это её пишет «Сохранить». Хук
 * возвращает только то, что показывать, поэтому нажатие в середине полёта
 * запишет выбранную позу, а не промежуточную.
 *
 * Глобальное правило `prefers-reduced-motion` в globals.css гасит переходы CSS,
 * но на `requestAnimationFrame` не влияет никак — медиазапрос проверяется здесь.
 */
export function useAnimatedJoints(target: readonly number[] | null): readonly number[] | null {
  const [shown, setShown] = useState<readonly number[] | null>(target);
  const from = useRef<readonly number[] | null>(target);
  const frame = useRef(0);

  useEffect(() => {
    if (target === null) {
      from.current = null;
      setShown(null);
      return;
    }

    // Первое появление копии — не движение, а возникновение: ехать неоткуда.
    const start = from.current;
    if (start === null || start.length !== target.length || reducedMotion()) {
      from.current = target;
      setShown(target);
      return;
    }

    const duration = motionDuration(start, target);
    const began = performance.now();

    const tick = (): void => {
      const progress = Math.min(1, (performance.now() - began) / duration);
      const next = interpolateJoints(start, target, easeInOut(progress));

      from.current = next;
      setShown(next);

      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else from.current = target;
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);

  return shown;
}

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
