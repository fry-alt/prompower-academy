# Экран урока: теория как этап — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** урок открывается теорией во всю ширину, задание работает в двух зонах с тянущимся разделителем, а в шапке снова стоит настоящий заголовок вместо ключа перевода.

**Architecture:** рабочее место урока получает состояние «теория или задание». Три колонки заменяются на свой `SplitPane` с разделителем, который во время перетаскивания пишет долю прямо в стиль и трогает состояние React только по отпусканию — в правой зоне холст three.js. Панель показа точки занимает зону редактора, а не отдельную колонку.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, next-intl, Playwright.

Спека: [../specs/2026-09-05-lesson-layout-design.md](../specs/2026-09-05-lesson-layout-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `components/simulator/split-pane.tsx` | новый: две зоны и тянущийся разделитель |
| `components/lesson/theory-view.tsx` | новый: экран теории с кнопкой «К заданию» |
| `components/simulator/lesson-workspace.tsx` | перестраивается: этапы, шапка, две зоны |
| `app/[locale]/lesson/[id]/page.tsx` | изменяется: отдаёт заголовок строкой |
| `app/[locale]/lesson/[id]/lesson-client.tsx` | изменяется: пропускает заголовок |
| `messages/ru.json`, `messages/en.json` | изменяются: «К заданию», «Теория» |
| `tests/e2e/lesson.spec.ts` | изменяется: уход с теории в `beforeEach` |
| `tests/e2e/course.spec.ts` | изменяется: этапы, разделитель, битые ключи |

Проверено по коду перед написанием плана:

- Шапка рабочего места зовёт `t('title')` с областью `lesson`, а ключ `lesson.title` удалён — на экране сейчас буквально написано `lesson.title`. Проверено запуском в браузере.
- Разметка живёт во вложенном компоненте `Workspace`, а не в `LessonWorkspace`: пропсы надо доводить до него.
- Левая зона переключается между `TaskBrief` и `TeachPanel`; в ней же теперь `theory` и `LessonNav`.

---

## Task 1: Разделитель

**Files:**
- Create: `components/simulator/split-pane.tsx`

- [ ] **Step 1: Написать компонент**

Создать `components/simulator/split-pane.tsx`:

```tsx
'use client';

import {
  useCallback,
  useRef,
  useState,
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

  const clamp = (value: number): number =>
    Math.min(MAX_FRACTION, Math.max(MIN_FRACTION, value));

  const drag = useCallback((clientX: number): void => {
    const box = container.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return;

    const next = Math.min(
      MAX_FRACTION,
      Math.max(MIN_FRACTION, (clientX - box.left) / box.width),
    );

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

  const nudge = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();

    const next = clamp(latest.current + (event.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP));
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
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

- [ ] **Step 3: Коммит**

```bash
git add components/simulator/split-pane.tsx
git commit -m "feat: тянущийся разделитель зон"
```

---

## Task 2: Экран теории и строки

**Files:**
- Create: `components/lesson/theory-view.tsx`
- Modify: `messages/ru.json`, `messages/en.json`

- [ ] **Step 1: Экран теории**

Создать `components/lesson/theory-view.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * Теория как этап урока.
 *
 * Колонка ограничена по ширине: комфортная строка — 500–700 пикселей, и именно
 * из-за этого теория не могла жить в боковой колонке на 320.
 */
export function TheoryView({ children, onStart }: { children: ReactNode; onStart: () => void }) {
  const t = useTranslations('course');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10">
        {children}

        <button
          type="button"
          data-testid="theory-start"
          onClick={onStart}
          className="self-start rounded-panel border border-brand/50 bg-brand/15 px-4 py-2 text-sm text-ink hover:bg-brand/25"
        >
          {t('startTask')}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Русские строки**

В `messages/ru.json` в раздел `course` добавить:

```json
    "startTask": "К заданию",
    "backToTheory": "Теория",
```

- [ ] **Step 3: Английские строки**

В `messages/en.json` в раздел `course` добавить:

```json
    "startTask": "Start the task",
    "backToTheory": "Theory",
```

- [ ] **Step 4: Коммит**

```bash
git add components/lesson/theory-view.tsx messages/
git commit -m "feat: экран теории с переходом к заданию"
```

---

## Task 3: Перестроить рабочее место

**Files:**
- Modify: `components/simulator/lesson-workspace.tsx`
- Modify: `app/[locale]/lesson/[id]/page.tsx`
- Modify: `app/[locale]/lesson/[id]/lesson-client.tsx`

- [ ] **Step 1: Заголовок строкой со страницы**

В `app/[locale]/lesson/[id]/page.tsx` добавить проп в вызов `LessonClient`:

```tsx
      title={lesson.meta.title}
```

В `app/[locale]/lesson/[id]/lesson-client.tsx` добавить `title: string;` в тип пропсов, принять его в аргументах и передать дальше в `LessonWorkspace` тем же именем.

- [ ] **Step 2: Пропсы и состояние этапа**

В `components/simulator/lesson-workspace.tsx` добавить импорты:

```tsx
import { TheoryView } from '@/components/lesson/theory-view';
import { SplitPane } from './split-pane';
```

В типы пропсов **обоих** компонентов (`LessonWorkspace` и вложенного `Workspace`) добавить:

```tsx
  title: string;
```

и провести `title` через вызов `<Workspace ... title={title} ... />`.

Внутри `Workspace` рядом с остальным состоянием завести этап:

```tsx
  // Теория — этап урока, а не колонка: §7 задаёт порядок «теория → задание», и
  // держать их одновременно значит не дать места ни тому, ни другому.
  const [reading, setReading] = useState(true);
```

- [ ] **Step 3: Новая разметка**

Заменить в `Workspace` всё от `<header` до закрывающего `</div>` внешнего контейнера на:

```tsx
    <div className="flex h-dvh flex-col bg-surface-0 text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-medium">{title}</h1>
          <p className="text-sm text-ink-dim">{tKey(plugin.displayNameKey)}</p>
        </div>

        <div className="flex items-center gap-3">
          {!reading && (
            <button
              type="button"
              data-testid="back-to-theory"
              onClick={() => setReading(true)}
              className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              {tCourse('backToTheory')}
            </button>
          )}

          {!reading && (
            <RunControls
              locked={teaching !== null}
              status={runner.status}
              speed={runner.speed}
              onPlay={runner.play}
              onPause={runner.pause}
              onStep={runner.stepOnce}
              onReset={runner.reset}
              onSpeed={runner.setSpeed}
            />
          )}
        </div>
      </header>

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
          left={
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
              {teaching === null ? (
                <>
                  <TaskBrief task={task} runner={runner} t={t} />
                  <ProgramPanel
                    plugin={plugin}
                    starter={starter}
                    onProgram={setProgram}
                    onTeach={startTeaching}
                    locked={teaching !== null}
                  />
                </>
              ) : (
                <TeachPanel
                  joints={plugin.joints}
                  chain={chain}
                  values={teaching.joints}
                  note={teaching.note}
                  onChange={moveTeaching}
                  onJog={jogTeaching}
                  onPose={poseTeaching}
                  onAlignDown={alignTeaching}
                  onSave={saveTeaching}
                  onCancel={() => setTeaching(null)}
                />
              )}
            </div>
          }
          right={<div className="relative min-h-0 flex-1">{scene}</div>}
        />
      )}
    </div>
```

Здесь `scene` — существующая разметка `<RobotViewer>…</RobotViewer>` вместе с
виньеткой и счётчиком кадров, вынесенная в переменную выше `return`. `tCourse` —
новый хук переводов рядом с существующими:

```tsx
  const tCourse = useTranslations('course');
```

Пропсы `ProgramPanel` брать из нынешней разметки без изменений: перенос не должен
менять её поведение.

- [ ] **Step 4: Подпись разделителя**

В `messages/ru.json` в `course` добавить `"splitLabel": "Ширина зон"`, в
`messages/en.json` — `"splitLabel": "Pane width"`.

- [ ] **Step 5: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: typecheck без вывода, тесты PASS.

- [ ] **Step 6: Коммит**

```bash
git add components/simulator/lesson-workspace.tsx "app/[locale]/lesson" messages/
git commit -m "feat: теория как этап, задание в двух зонах с разделителем"
```

---

## Task 4: Сквозные тесты

**Files:**
- Modify: `tests/e2e/lesson.spec.ts`

- [ ] **Step 1: Поправить существующие тесты**

Все тесты урока работают с блоками и сценой, а на экране теории их нет. Клик
должен идти **строго между переходом и ожиданиями**: иначе `beforeEach` будет
ждать холст, которого ещё не существует.

В `tests/e2e/lesson.spec.ts` заменить начало `beforeEach`:

```ts
test.beforeEach(async ({ page }) => {
  await page.goto(LESSON);
  // Урок открывается теорией: до задания холстов на странице нет.
  await page.getByTestId('theory-start').click();
  // Именно сцена: Blockly держит свой скрытый canvas для замера текста, и
  // селектор без уточнения находит оба.
  await expect(page.locator('main canvas')).toBeVisible();
```

- [ ] **Step 2: Добавить тесты этапов и разделителя**

Дописать в конец `tests/e2e/course.spec.ts`, а не файла урока: там нет
`beforeEach`, который уводит с теории, и эти тесты не будут ходить по странице
дважды.

```ts
test('урок открывается теорией, а не заданием', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  await expect(page.getByTestId('theory-start')).toBeVisible();
  await expect(page.getByTestId('block-editor')).toHaveCount(0);
});

test('к теории можно вернуться, не потеряв программу', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');
  await page.getByTestId('theory-start').click();
  await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('back-to-theory').click();
  await expect(page.getByTestId('theory-start')).toBeVisible();

  await page.getByTestId('theory-start').click();
  await expect(page.getByTestId('block-editor')).toBeVisible();
});

test('разделитель меняет ширину зон', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');
  await page.getByTestId('theory-start').click();
  await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 30_000 });

  const handle = page.getByTestId('split-handle');
  const before = Number(await handle.getAttribute('aria-valuenow'));

  // Клавиатурой, а не мышью: §9 требует, чтобы всё работало с клавиатуры.
  await handle.focus();
  await handle.press('ArrowRight');
  await handle.press('ArrowRight');

  await expect
    .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
    .toBeGreaterThan(before);
});

test('на экране урока нет незакрытых ключей перевода', async ({ page }) => {
  // Ключ `lesson.title` однажды остался в шапке после переноса заголовков в
  // содержание, и ни один тест этого не заметил.
  await page.goto('/ru/lesson/instrument-i-zahvat');
  await page.getByTestId('theory-start').click();
  await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 30_000 });

  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\b(lesson|course|sandbox|app)\.[a-zA-Z]+\b/);
});
```

- [ ] **Step 3: Прогнать**

Run: `npx playwright test tests/e2e/lesson.spec.ts tests/e2e/course.spec.ts`
Expected: PASS — 20 в файле урока и 8 в файле курса.

- [ ] **Step 4: Коммит**

```bash
git add tests/e2e/lesson.spec.ts tests/e2e/course.spec.ts
git commit -m "test: этапы урока, разделитель и защита от битых ключей"
```

---

## Task 5: Проверка целиком

**Files:** нет

- [ ] **Step 1: Типы**

Run: `npm run typecheck`
Expected: без вывода.

- [ ] **Step 2: Unit**

Run: `npm test`
Expected: PASS, 363 теста.

- [ ] **Step 3: E2E**

Run: `npx playwright test`
Expected: PASS. Файл урока медленный; при падении по таймауту прогнать его
отдельно, прежде чем считать это поломкой.

- [ ] **Step 4: Посмотреть глазами**

Открыть урок: теория читается широкой колонкой, «К заданию» уводит на рабочий
экран, разделитель тянется, показ точки занимает левую зону и сцена остаётся
большой, в шапке настоящий заголовок.

- [ ] **Step 5: Закрыть ветку**

Использовать `superpowers:finishing-a-development-branch`.
