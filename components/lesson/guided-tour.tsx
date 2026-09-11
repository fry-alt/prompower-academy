'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Program } from '@prompower/sim-core';
import { countOp, type Tour } from '@/lib/tour';

/**
 * Обучение с подсветкой: куда смотреть и что нажать.
 *
 * Затемнение — четыре прямоугольника вокруг цели, и все они не ловят указатель.
 * Дырка в середине поэтому кликается сама собой, а человек в любой момент может
 * отвлечься на что-то другое: тур ведёт, но не запирает.
 *
 * Положение цели опрашивается по таймеру. Флайаут Blockly открывается и двигает
 * соседей, панель показа точки меняет высоту, сцена ресайзится — подписаться на
 * каждое такое событие значит однажды пропустить новое.
 */

/** Как часто перемеряем цель. Четыре раза в секунду глазу хватает. */
const MEASURE_MS = 250;

/** Отступ рамки от цели и карточки от рамки. */
const RING = 6;
const GAP = 12;

const CARD_WIDTH = 320;
const CARD_HEIGHT = 150;

export function GuidedTour({
  tour,
  program,
  passed,
  onClose,
}: {
  tour: Tour;
  /** Нужна шагам, которые ждут появления блока в программе. */
  program: Program;
  passed: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('lesson');
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);

  const step = tour.steps[index];

  // Шаги кончились — обучение пройдено.
  useEffect(() => {
    if (step === undefined) onClose();
  }, [step, onClose]);

  // Цель нового шага показываем сразу: кнопка «К заданию» лежит внизу длинной
  // теории, и подсветка без прокрутки осталась бы за краем экрана. Один раз на
  // шаг — иначе тур дрался бы с человеком за положение страницы.
  useEffect(() => {
    if (step === undefined) return;

    const target = document.querySelector(step.target);
    if (target !== null && !inView(target.getBoundingClientRect())) {
      target.scrollIntoView({ block: 'center' });
    }
  }, [step]);

  useEffect(() => {
    if (step === undefined) return;

    const measure = (): void => {
      const target = document.querySelector(step.target);
      setBox(target === null ? null : target.getBoundingClientRect());
    };

    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener('resize', measure);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  // Нажатие ловим на погружении: Blockly глушит всплытие, и обычный слушатель
  // до нас бы не дошёл.
  useEffect(() => {
    if (step?.done.kind !== 'click') return;

    const onClick = (event: MouseEvent): void => {
      const target = document.querySelector(step.target);
      if (target === null || !(event.target instanceof Node)) return;
      if (target.contains(event.target)) setIndex((current) => current + 1);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [step]);

  useEffect(() => {
    if (step === undefined) return;

    const done =
      step.done.kind === 'programHas'
        ? countOp(program, step.done.op) >= step.done.count
        : step.done.kind === 'passed' && passed;

    if (done) setIndex((current) => current + 1);
  }, [step, program, passed]);

  if (step === undefined) return null;

  return (
    <div data-testid="tour" className="pointer-events-none fixed inset-0 z-50">
      {box !== null && <Spotlight box={box} />}

      <div
        className="pointer-events-auto absolute w-80 rounded-panel border border-line bg-surface-1 p-4 shadow-lg"
        style={cardPosition(box)}
      >
        <p className="text-xs text-ink-faint">
          {t('tour.step', { current: index + 1, total: tour.steps.length })}
        </p>
        <p data-testid="tour-text" className="mt-1 text-sm text-ink">
          {step.text}
        </p>

        <button
          type="button"
          data-testid="tour-skip"
          onClick={onClose}
          className="mt-3 text-xs text-ink-faint underline-offset-2 hover:text-ink-dim hover:underline"
        >
          {t('tour.skip')}
        </button>
      </div>
    </div>
  );
}

/** Затемнение с дыркой по цели и рамка вокруг неё. */
function Spotlight({ box }: { box: DOMRect }) {
  const top = box.top - RING;
  const bottom = box.bottom + RING;
  const left = box.left - RING;
  const right = box.right + RING;

  return (
    <>
      <div className="absolute bg-black/55" style={{ top: 0, left: 0, right: 0, height: max(top) }} />
      <div className="absolute bg-black/55" style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div
        className="absolute bg-black/55"
        style={{ top, left: 0, width: max(left), height: bottom - top }}
      />
      <div className="absolute bg-black/55" style={{ top, left: right, right: 0, height: bottom - top }} />

      <div
        className="absolute rounded-panel ring-2 ring-brand"
        style={{ top, left, width: right - left, height: bottom - top }}
      />
    </>
  );
}

function max(value: number): number {
  return Math.max(0, value);
}

/**
 * Карточка под целью, а если снизу тесно — над ней. Цель без места на экране
 * (или ещё не отрисованная) отправляет карточку вниз по центру: текст шага
 * нужен человеку и без подсветки.
 */
function cardPosition(box: DOMRect | null): { top: number; left: number } {
  if (box === null) {
    return {
      top: window.innerHeight - CARD_HEIGHT - GAP * 2,
      left: (window.innerWidth - CARD_WIDTH) / 2,
    };
  }

  const below = box.bottom + RING + GAP;
  const top = below + CARD_HEIGHT < window.innerHeight ? below : box.top - RING - GAP - CARD_HEIGHT;

  return {
    top: clamp(top, GAP, window.innerHeight - CARD_HEIGHT - GAP),
    left: clamp(box.left, GAP, window.innerWidth - CARD_WIDTH - GAP),
  };
}

/** Цель за краем экрана — повод прокрутить, а не рисовать подсветку в пустоте. */
function inView(box: DOMRect): boolean {
  return box.top >= 0 && box.bottom <= window.innerHeight;
}

function clamp(value: number, least: number, most: number): number {
  return Math.min(Math.max(value, least), Math.max(least, most));
}
