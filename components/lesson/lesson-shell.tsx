'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { Program, RobotPlugin } from '@prompower/sim-core';
import { GuidedTour } from './guided-tour';
import { LessonHeader } from './lesson-header';
import { LessonNav, type LessonLink } from './lesson-nav';
import { TheoryView } from './theory-view';
import { SplitPane } from '@/components/simulator/split-pane';
import type { Tour } from '@/lib/tour';

/**
 * Обвязка экрана урока: шапка, этап теории, две зоны, сцена и обучение.
 *
 * Всё, что у урока с блоками и урока с ползунками одинаково, живёт здесь.
 * Раньше это была копия на девяносто строк, и она успела разъехаться раньше,
 * чем попала в main: в одной из копий счётчик потерял время загрузки, а зоны
 * разошлись шириной без всякой причины.
 *
 * Различаются уроки тремя вещами — кнопками в шапке, левой зоной и содержимым
 * сцены, — и ровно они приходят сюда узлами.
 */
export function LessonShell({
  plugin,
  title,
  theory,
  previous,
  next,
  tour,
  passed,
  program,
  controls,
  left,
  viewer,
  loadMs,
  fps,
}: {
  plugin: RobotPlugin;
  title: string;
  /** Теория собрана на сервере и приходит готовым узлом. */
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
  /** Сценарий обучения: подсветка кнопок. Урок без него — обычное дело. */
  tour: Tour | null;
  /** Задание зачтено: этим закрывается последний шаг обучения. */
  passed: boolean;
  /** Программа урока — для шагов обучения, считающих блоки. */
  program?: Program | undefined;
  /** Кнопки урока в шапке. Видны только на этапе задания. */
  controls: ReactNode;
  /** Левая зона: условие задания и то, чем его решают. */
  left: ReactNode;
  /** Сцена целиком, вместе с роботом и разметкой задания. */
  viewer: ReactNode;
  /** Время загрузки модели, мс. */
  loadMs: number;
  fps: number;
}) {
  const t = useTranslations('lesson');
  const tKey = useTranslations();
  const tCourse = useTranslations('course');

  // Теория — этап урока, а не колонка. §7 задаёт порядок «теория → задание»,
  // и держать их одновременно значит не дать места ни тому, ни другому.
  const [reading, setReading] = useState(true);

  // Обучение идёт поверх обоих этапов урока: первый шаг указывает на кнопку
  // «К заданию», а она живёт на теории.
  const [touring, setTouring] = useState(tour !== null);
  const closeTour = useCallback(() => setTouring(false), []);

  return (
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <LessonHeader title={title} model={tKey(plugin.displayNameKey)}>
        {tour !== null && !touring && (
          <button
            type="button"
            data-testid="tour-restart"
            onClick={() => setTouring(true)}
            className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
          >
            {t('tour.restart')}
          </button>
        )}

        {!reading && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="back-to-theory"
              onClick={() => setReading(true)}
              className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              {tCourse('backToTheory')}
            </button>

            {controls}
          </div>
        )}
      </LessonHeader>

      {plugin.placeholderNoticeKey !== null && (
        <p role="status" className="border-b border-line bg-surface-1 px-5 py-2 text-sm text-warn">
          {tKey(plugin.placeholderNoticeKey)}
        </p>
      )}

      {reading ? (
        <>
          <TheoryView onStart={() => setReading(false)}>{theory}</TheoryView>
          <div className="border-t border-line px-5 py-3">
            <LessonNav previous={previous} next={next} />
          </div>
        </>
      ) : (
        <SplitPane
          label={tCourse('splitLabel')}
          initial={0.52}
          left={<div className="flex min-h-0 flex-1 flex-col">{left}</div>}
          right={
            <main className="relative min-h-0 flex-1">
              {viewer}

              {/* Виньетка: сцена перестаёт выглядеть вырезанной в пустоте. Делается
                  наложением поверх холста, а не в сцене — шейдер ради неё писать
                  незачем, а пакет постобработки мы не подключаем. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,transparent_45%,rgba(0,0,0,0.5)_100%)]"
              />

              <p
                data-testid="scene-stats"
                className="pointer-events-none absolute bottom-3 right-4 font-mono text-xs text-ink-faint"
              >
                <span data-testid="load-ms">{loadMs}</span> ms · {fps} fps
              </p>
            </main>
          }
        />
      )}

      {tour !== null && touring && (
        <GuidedTour tour={tour} program={program} passed={passed} onClose={closeTour} />
      )}
    </div>
  );
}

/** Верхняя половина левой зоны: условие задания над тем, чем его решают. */
export function LessonBrief({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-line p-5">{children}</div>
  );
}
