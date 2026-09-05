'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HOLD_STEPS_PER_SECOND, HOLD_THRESHOLD_MS } from './joint-motion';

/**
 * Короткое нажатие против удержания, как на промышленном пульте.
 *
 * Удержание не заводит отдельного пути в обратную задачу: оно повторяет тот же
 * одиночный шаг восемь раз в секунду, а хук анимации сглаживает эти шаги в
 * непрерывное движение.
 */

export interface HoldHandlers {
  readonly onPointerDown: () => void;
  readonly onPointerUp: () => void;
  readonly onPointerLeave: () => void;
  readonly onPointerCancel: () => void;
}

export function useHoldJog(): {
  /** Кнопка, которую держат прямо сейчас, или null: для подсветки. */
  readonly held: string | null;
  /** `step` возвращает false, если дальше не достаём — тогда движение встаёт. */
  bind: (id: string, step: () => boolean) => HoldHandlers;
} {
  const [held, setHeld] = useState<string | null>(null);
  const latest = useRef<() => boolean>(() => false);
  const timer = useRef<number | null>(null);
  const delay = useRef<number | null>(null);

  const stop = useCallback((): void => {
    if (delay.current !== null) window.clearTimeout(delay.current);
    if (timer.current !== null) window.clearInterval(timer.current);
    delay.current = null;
    timer.current = null;
    setHeld(null);
  }, []);

  // Уход фокуса окном: без этого переключение вкладки на середине удержания
  // оставило бы робота едущим, и вернувшийся человек нашёл бы руку неизвестно где.
  useEffect(() => {
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('blur', stop);
      stop();
    };
  }, [stop]);

  const bind = (id: string, step: () => boolean): HoldHandlers => {
    // Пока кнопку держат, поза меняется восемь раз в секунду, компонент
    // перерисовывается и сюда приходит новое замыкание. Интервал же живёт между
    // рендерами: без этого обновления он до конца удержания двигал бы робота от
    // позы, устаревшей на момент нажатия. Присваивание идемпотентное и касается
    // только удерживаемой кнопки.
    if (held === id) latest.current = step;

    return {
      onPointerDown: () => {
        latest.current = step;
        // Шаг делаем сразу: нажатие обязано отзываться, а не ждать порога.
        if (!latest.current()) return;

        setHeld(id);
        delay.current = window.setTimeout(() => {
          timer.current = window.setInterval(() => {
            if (!latest.current()) stop();
          }, 1000 / HOLD_STEPS_PER_SECOND);
        }, HOLD_THRESHOLD_MS);
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
    };
  };

  return { held, bind };
}
