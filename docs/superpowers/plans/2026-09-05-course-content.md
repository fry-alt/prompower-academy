# Оболочка содержания курса — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** уроки находятся по файловой системе и добавляются без правки кода, у урока появляется теория, а у курса — карта и переход между уроками.

**Architecture:** `lib/content.ts` читает `content/courses/`, порядок берёт из числового префикса папки, метаданные — из фронтматтера MDX. Чистые помощники (разбор префикса, выбор локали) проверяются unit-тестами, чтение с диска — сквозными. Теория собирается на сервере и передаётся в рабочее место урока готовым узлом: `LessonWorkspace` грузится с `ssr: false` и отрисовать MDX у себя не может.

**Tech Stack:** Next.js 15 App Router, next-mdx-remote 6, next-intl, Vitest, Playwright.

Спека: [../specs/2026-09-05-course-content-design.md](../specs/2026-09-05-course-content-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `lib/content.ts` | новый: перечисление курсов и уроков, чтение одного урока |
| `lib/content.test.ts` | новый: тесты чистых помощников |
| `content/courses/osnovy-raboty-s-kobotom/course.json` | новый: название и описание курса |
| `content/.../04-instrument-i-zahvat/lesson.ru.mdx` | новый: теория урока с фронтматтером |
| `app/[locale]/page.tsx` | переписывается: карта курса вместо переадресации |
| `app/[locale]/lesson/[id]/page.tsx` | изменяется: загрузчик вместо зашитой карты, теория, соседи |
| `app/[locale]/lesson/[id]/lesson-client.tsx` | изменяется: пропускает теорию и переход внутрь |
| `components/simulator/lesson-workspace.tsx` | изменяется: теория и переход в левой зоне |
| `components/lesson/lesson-theory.tsx` | новый: оформление MDX |
| `components/lesson/lesson-nav.tsx` | новый: «назад» и «дальше» |
| `messages/ru.json`, `messages/en.json` | изменяются: строки карты и перехода |

Проверено по коду перед написанием плана:

- `next-mdx-remote` 6.0.0 есть на зеркале `registry.npmmirror.com`.
- `LessonWorkspace` подключается через `dynamic(..., { ssr: false })` из клиентского `lesson-client.tsx`. Серверный узел проходит сквозь клиентский компонент пропом — это обычный приём, но отрисовать MDX внутри самого рабочего места нельзя.
- Автопроверка знает только цели `objectInZone` и `gripperState`, поэтому теорию пишем к уже работающему уроку 4.
- Левая зона урока сейчас `lg:w-72` и переключается между `TaskBrief` и `TeachPanel`.

---

## Task 1: Зависимость и загрузчик

**Files:**
- Create: `lib/content.ts`
- Create: `lib/content.test.ts`

- [x] **Step 1: Поставить next-mdx-remote**

Run: `npm install next-mdx-remote@6`
Expected: пакет ставится; зеркало отдаёт медленно, это нормально.

- [x] **Step 2: Написать падающие тесты**

Создать `lib/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lessonFileFor, orderOf, slugOf } from './content';

describe('slugOf', () => {
  it('снимает числовой префикс папки', () => {
    expect(slugOf('04-instrument-i-zahvat')).toBe('instrument-i-zahvat');
    expect(slugOf('01-znakomstvo')).toBe('znakomstvo');
  });

  it('папку без префикса оставляет как есть', () => {
    expect(slugOf('bonus-urok')).toBe('bonus-urok');
  });
});

describe('orderOf', () => {
  it('читает номер из префикса', () => {
    expect(orderOf('04-instrument-i-zahvat')).toBe(4);
    expect(orderOf('10-final')).toBe(10);
  });

  it('папку без префикса ставит в конец', () => {
    // Урок без номера не должен молча встать первым и перепутать порядок курса.
    expect(orderOf('bonus-urok')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('lessonFileFor', () => {
  const files = ['lesson.ru.mdx', 'lesson.en.mdx', 'task.json'];

  it('берёт запрошенную локаль', () => {
    expect(lessonFileFor(files, 'en')).toBe('lesson.en.mdx');
  });

  it('откатывается на русский, когда перевода нет', () => {
    expect(lessonFileFor(['lesson.ru.mdx'], 'en')).toBe('lesson.ru.mdx');
  });

  it('без единого текста возвращает null', () => {
    expect(lessonFileFor(['task.json'], 'ru')).toBe(null);
  });
});
```

- [x] **Step 3: Убедиться, что тесты падают**

Run: `npx vitest run lib/content.test.ts`
Expected: FAIL — модуль `./content` не найден.

- [x] **Step 4: Написать загрузчик**

Создать `lib/content.ts`:

```ts
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compileMDX } from 'next-mdx-remote/rsc';
import type { ReactElement } from 'react';

/**
 * Содержание курсов с диска.
 *
 * §7 брифа требует, чтобы уроки добавлялись без правки кода. Поэтому список
 * уроков не хранится нигде: он и есть содержимое каталога. Порядок живёт в
 * числовом префиксе папки — второго источника правды о порядке нет, и разойтись
 * им негде.
 */

const COURSES = join(process.cwd(), 'content', 'courses');

const FALLBACK_LOCALE = 'ru';

export interface LessonMeta {
  /** Адрес урока: имя папки без числового префикса. */
  readonly slug: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  /** Время чтения теории, минуты. Задаёт автор, §7 просит держаться 2–4. */
  readonly minutes: number;
}

export interface Course {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly lessons: readonly LessonMeta[];
}

export interface Lesson {
  readonly meta: LessonMeta;
  /** Готовый узел теории: собран на сервере, отрисовывается как есть. */
  readonly theory: ReactElement;
  readonly task: unknown;
  readonly starter: object;
  readonly previous: LessonMeta | null;
  readonly next: LessonMeta | null;
}

/** Имя папки без числового префикса. */
export function slugOf(folder: string): string {
  return folder.replace(/^\d+-/, '');
}

/** Номер урока из префикса. Без префикса — в конец, чтобы не путать порядок. */
export function orderOf(folder: string): number {
  const match = /^(\d+)-/.exec(folder);
  return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1]);
}

/** Файл теории на нужном языке, с откатом на русский. */
export function lessonFileFor(files: readonly string[], locale: string): string | null {
  const wanted = `lesson.${locale}.mdx`;
  if (files.includes(wanted)) return wanted;

  const fallback = `lesson.${FALLBACK_LOCALE}.mdx`;
  return files.includes(fallback) ? fallback : null;
}

/** Все курсы с уроками по порядку. */
export async function loadCourses(locale: string): Promise<Course[]> {
  const slugs = await subdirectories(COURSES);

  return Promise.all(slugs.map((slug) => loadCourse(slug, locale)));
}

async function loadCourse(slug: string, locale: string): Promise<Course> {
  const root = join(COURSES, slug);
  const info = JSON.parse(await readFile(join(root, 'course.json'), 'utf8')) as {
    title: string;
    description: string;
  };

  const folders = await subdirectories(join(root, 'lessons'));
  const lessons = await Promise.all(
    folders.map((folder) => readMeta(join(root, 'lessons', folder), folder, locale)),
  );

  return {
    slug,
    title: info.title,
    description: info.description,
    lessons: lessons.sort((a, b) => a.order - b.order),
  };
}

/** Урок по адресу. Ищется во всех курсах: адрес урока не включает курс. */
export async function loadLesson(slug: string, locale: string): Promise<Lesson | null> {
  const courses = await loadCourses(locale);

  for (const course of courses) {
    const index = course.lessons.findIndex((lesson) => lesson.slug === slug);
    if (index === -1) continue;

    const meta = course.lessons[index];
    if (meta === undefined) continue;

    const folder = `${String(meta.order).padStart(2, '0')}-${meta.slug}`;
    const root = join(COURSES, course.slug, 'lessons', folder);
    const files = await readdir(root);
    const file = lessonFileFor(files, locale);
    if (file === null) return null;

    const { content } = await compileMDX({
      source: await readFile(join(root, file), 'utf8'),
      options: { parseFrontmatter: true },
    });

    return {
      meta,
      theory: content,
      task: JSON.parse(await readFile(join(root, 'task.json'), 'utf8')) as unknown,
      starter: JSON.parse(await readFile(join(root, 'starter.json'), 'utf8')) as object,
      previous: course.lessons[index - 1] ?? null,
      next: course.lessons[index + 1] ?? null,
    };
  }

  return null;
}

/** Адреса всех уроков: для статической сборки страниц. */
export async function allLessonSlugs(): Promise<string[]> {
  const courses = await loadCourses(FALLBACK_LOCALE);
  return courses.flatMap((course) => course.lessons.map((lesson) => lesson.slug));
}

async function readMeta(root: string, folder: string, locale: string): Promise<LessonMeta> {
  const files = await readdir(root);
  const file = lessonFileFor(files, locale);
  if (file === null) {
    throw new Error(`У урока ${folder} нет файла теории lesson.<локаль>.mdx`);
  }

  // Метаданные достаём тем же сборщиком, что и текст: свой разбор фронтматтера
  // означал бы свой разбор YAML, а это классическая ошибка. Сборка статическая,
  // лишняя компиляция шести уроков ничего не стоит.
  const { frontmatter } = await compileMDX<{
    title: string;
    description: string;
    minutes: number;
  }>({
    source: await readFile(join(root, file), 'utf8'),
    options: { parseFrontmatter: true },
  });

  if (typeof frontmatter.title !== 'string' || typeof frontmatter.minutes !== 'number') {
    throw new Error(`У урока ${folder} во фронтматтере нет title или minutes`);
  }

  return {
    slug: slugOf(folder),
    order: orderOf(folder),
    title: frontmatter.title,
    description: frontmatter.description,
    minutes: frontmatter.minutes,
  };
}

async function subdirectories(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}
```

- [x] **Step 5: Прогнать тесты**

Run: `npx vitest run lib/content.test.ts`
Expected: PASS, 8 тестов.

- [x] **Step 6: Коммит**

```bash
git add lib/content.ts lib/content.test.ts package.json package-lock.json
git commit -m "feat: уроки находятся по файловой системе"
```

---

## Task 2: Содержание урока

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/course.json`
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/04-instrument-i-zahvat/lesson.ru.mdx`

- [x] **Step 1: Описание курса**

Создать `content/courses/osnovy-raboty-s-kobotom/course.json`:

```json
{
  "title": "Основы работы с коботом",
  "description": "Шесть уроков о том, как устроен коллаборативный робот и как заставить его выполнять работу. Без установки программ: робот, пульт и задания живут прямо в браузере."
}
```

- [x] **Step 2: Теория урока**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/04-instrument-i-zahvat/lesson.ru.mdx`:

```mdx
---
title: Инструмент и захват
description: Что такое TCP, почему робот знает не только где он, но и чем работает, и как переставить деталь.
minutes: 3
---

Робот сам по себе ничего не делает. Работу выполняет то, что закреплено на его
конце: захват, присоска, отвёртка, сварочная горелка. Это называют рабочим
органом, а место, которым он касается детали, — **центром инструмента**. В
документации и на пульте вы встретите сокращение TCP, tool center point.

## Зачем роботу знать про инструмент

Робот управляет не захватом, а фланцем — стальным кругом на конце руки, к
которому инструмент прикручен. Между фланцем и точкой захвата есть расстояние, и
пока робот о нём не знает, все ваши команды промахиваются ровно на это
расстояние.

Отсюда правило, которое стоит запомнить раньше всех остальных: **сменили
инструмент — заново задайте TCP**. Робот, уверенный, что держит короткий захват,
а на деле несущий длинный, воткнёт инструмент в стол.

## Куда смотрит инструмент

У точки инструмента есть не только положение, но и направление. Захват,
подведённый к детали сверху, и захват, подведённый сбоку, стоят в одной точке —
но возьмут деталь по-разному, а иногда не возьмут вовсе.

Направление задают три угла поворота. В этом уроке пригодится всего одно
положение — инструмент смотрит строго вниз, перпендикулярно столу. Набирать его
вручную неудобно, поэтому в панели координат есть кнопка, которая ставит
инструмент вертикально одним нажатием.

## Полезная нагрузка

Кроме размеров инструмента робот должен знать его вес и вес детали. Это не
формальность: по массе он рассчитывает усилия в суставах. Заниженная нагрузка —
и робот на скорости не удержит траекторию, завышенная — сработает защита и
остановит программу.

## Что делать в задании

Переложите деталь из зоны A в зону B. Порядок такой же, как у человека:
подвестись над деталью, опуститься, взять, поднять, перенести, опустить,
отпустить, убрать руку.

Два места, где ошибаются чаще всего:

- **Подходить к детали сверху, а не сбоку.** Сбоку захват столкнёт деталь
  раньше, чем сомкнётся.
- **Открывать захват уже над зоной B**, а не по дороге. Открытый в движении
  захват роняет деталь там, где она оказалась.

Точки не обязательно набирать числами. Нажмите кнопку в блоке движения, доведите
серую копию робота до нужного места и сохраните — поза запомнится сама.
```

- [x] **Step 3: Коммит**

```bash
git add content/
git commit -m "feat: теория урока об инструменте и захвате"
```

---

## Task 3: Строки интерфейса

**Files:**
- Modify: `messages/ru.json`
- Modify: `messages/en.json`

- [x] **Step 1: Русские строки**

В `messages/ru.json` удалить `lesson.title` и `lesson.description` — они теперь во фронтматтере урока. Добавить на верхнем уровне раздел карты курса:

```json
"course": {
  "lessonNumber": "Урок {number}",
  "minutes": "{count} мин",
  "start": "Начать урок",
  "theory": "Теория",
  "previous": "Назад",
  "next": "Дальше",
  "lastLesson": "Это последний урок курса"
}
```

- [x] **Step 2: Английские строки**

В `messages/en.json` те же удаления и добавления:

```json
"course": {
  "lessonNumber": "Lesson {number}",
  "minutes": "{count} min",
  "start": "Start lesson",
  "theory": "Theory",
  "previous": "Back",
  "next": "Next",
  "lastLesson": "This is the last lesson of the course"
}
```

- [x] **Step 3: Коммит**

```bash
git add messages/
git commit -m "feat: строки карты курса и перехода между уроками"
```

---

## Task 4: Карта курса

**Files:**
- Modify: `app/[locale]/page.tsx`

- [x] **Step 1: Переписать домашнюю страницу**

Заменить содержимое `app/[locale]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { loadCourses } from '@/lib/content';

/**
 * Карта курса. Раньше корень локали переадресовывал в песочницу: у обучающей
 * платформы на первой странице должен быть курс, а не отладочный стенд.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [course] = await loadCourses(locale);
  if (course === undefined) return {};

  return { title: course.title, description: course.description };
}

export default async function CourseMapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'course' });
  const courses = await loadCourses(locale);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-12">
      {courses.map((course) => (
        <section key={course.slug} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-medium">{course.title}</h1>
            <p className="text-sm leading-relaxed text-ink-dim">{course.description}</p>
          </div>

          <ol className="flex flex-col gap-2">
            {course.lessons.map((lesson, index) => (
              <li key={lesson.slug}>
                <Link
                  href={`/lesson/${lesson.slug}`}
                  className="flex items-baseline gap-4 rounded-panel border border-line p-4 transition-colors hover:border-brand/50 hover:bg-surface-1"
                >
                  <span className="font-mono text-xs text-ink-faint">
                    {t('lessonNumber', { number: index + 1 })}
                  </span>

                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-sm font-medium">{lesson.title}</span>
                    <span className="text-sm text-ink-dim">{lesson.description}</span>
                  </span>

                  <span className="font-mono text-xs text-ink-faint">
                    {t('minutes', { count: lesson.minutes })}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
```

Номер урока берётся из позиции в списке, а не из префикса папки: в курсе с одним написанным уроком «Урок 4» выглядел бы ошибкой.

- [x] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

- [x] **Step 3: Коммит**

```bash
git add "app/[locale]/page.tsx"
git commit -m "feat: карта курса на первой странице"
```

---

## Task 5: Теория и переход на экране урока

**Files:**
- Create: `components/lesson/lesson-theory.tsx`
- Create: `components/lesson/lesson-nav.tsx`
- Modify: `app/[locale]/lesson/[id]/page.tsx`
- Modify: `app/[locale]/lesson/[id]/lesson-client.tsx`
- Modify: `components/simulator/lesson-workspace.tsx`

- [x] **Step 1: Оформление теории**

Создать `components/lesson/lesson-theory.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * Оформление теории урока.
 *
 * MDX собран на сервере и приходит готовым узлом. Здесь только типографика:
 * узкая колонка, спокойный ритм, читаемость часами подряд — §9 просит
 * ориентироваться на промышленные интерфейсы, а не на лендинги.
 */
export function LessonTheory({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-3">
      <h1 className="text-base font-medium">{title}</h1>

      <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-dim [&_a]:text-brand [&_a]:underline [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-ink [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-ink [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </div>
    </article>
  );
}
```

- [x] **Step 2: Переход между уроками**

Создать `components/lesson/lesson-nav.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * Переход по порядку курса. Последний урок честно говорит, что он последний:
 * §9 требует, чтобы пустые состояния были указанием, а не украшением.
 */
/** Сосед по курсу. Объявлен здесь один раз: страница, обёртка и рабочее место
    передают его друг другу, и три копии этого типа разошлись бы молча. */
export interface LessonLink {
  readonly slug: string;
  readonly title: string;
}

export function LessonNav({
  previous,
  next,
}: {
  previous: LessonLink | null;
  next: LessonLink | null;
}) {
  const t = useTranslations('course');

  return (
    <nav data-testid="lesson-nav" className="flex items-center justify-between gap-2 text-sm">
      {previous === null ? (
        <span />
      ) : (
        <Link
          href={`/lesson/${previous.slug}`}
          data-testid="lesson-previous"
          className="text-ink-dim hover:text-ink"
        >
          {t('previous')}
        </Link>
      )}

      {next === null ? (
        <span className="text-ink-faint">{t('lastLesson')}</span>
      ) : (
        <Link
          href={`/lesson/${next.slug}`}
          data-testid="lesson-next"
          className="text-ink hover:text-brand"
        >
          {t('next')}
        </Link>
      )}
    </nav>
  );
}
```

- [x] **Step 3: Страница урока через загрузчик**

Заменить содержимое `app/[locale]/lesson/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { parseTask } from '@prompower/sim-core';
import { LessonTheory } from '@/components/lesson/lesson-theory';
import { allLessonSlugs, loadLesson } from '@/lib/content';
import { LessonClient } from './lesson-client';

/**
 * Урок с интерактивным заданием.
 *
 * Ни списка уроков, ни их заголовков здесь нет: и то и другое приходит из
 * каталога курсов. §7 требует, чтобы урок добавлялся без правки кода.
 */

export async function generateStaticParams() {
  const slugs = await allLessonSlugs();
  return slugs.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const lesson = await loadLesson(id, locale);
  if (lesson === null) return {};

  return { title: lesson.meta.title, description: lesson.meta.description };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const lesson = await loadLesson(id, locale);
  if (lesson === null) notFound();

  // Задание разбираем на сервере: битый файл курса должен ломать сборку, а не
  // урок у ученика. Холст уходит на клиент как есть — его разбирает Blockly.
  return (
    <LessonClient
      task={parseTask(lesson.task)}
      starter={lesson.starter}
      previous={lesson.previous}
      next={lesson.next}
      theory={<LessonTheory title={lesson.meta.title}>{lesson.theory}</LessonTheory>}
    />
  );
}
```

- [x] **Step 4: Пропустить теорию через клиентскую обёртку**

Заменить в `app/[locale]/lesson/[id]/lesson-client.tsx` объявление компонента:

```tsx
export function LessonClient({
  task,
  starter,
  theory,
  previous,
  next,
}: {
  task: Task;
  starter: object;
  /* Готовый узел с сервера: рабочее место грузится с `ssr: false` и собрать
     MDX у себя не может. */
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
}) {
  return (
    <LessonWorkspace
      plugin={jakaZu7}
      task={task}
      starter={starter}
      theory={theory}
      previous={previous}
      next={next}
    />
  );
}
```

И добавить к импортам этого файла:

```tsx
import type { ReactNode } from 'react';
import type { LessonLink } from '@/components/lesson/lesson-nav';
```

- [x] **Step 5: Теория и переход в левой зоне**

В `components/simulator/lesson-workspace.tsx` добавить импорт:

```tsx
import { LessonNav, type LessonLink } from '@/components/lesson/lesson-nav';
```

Расширить пропсы:

```tsx
export function LessonWorkspace({
  plugin,
  task,
  starter,
  theory,
  previous,
  next,
}: {
  plugin: RobotPlugin;
  task: Task;
  starter: object;
  theory: ReactNode;
  previous: LessonLink | null;
  next: LessonLink | null;
}) {
```

В существующем импорте из `react` добавить `type ReactNode` к тому, что уже есть:

```tsx
import { useMemo, useState, type ReactNode } from 'react';
```

В разметке заменить содержимое левой зоны: теория стоит над заданием и остаётся
видимой в режиме показа точки — её могут перечитывать по ходу дела.

```tsx
        <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-line p-5 lg:w-80 lg:border-b-0 lg:border-r">
          {theory}

          <hr className="border-line" />

          {teaching === null ? (
            <TaskBrief task={task} runner={runner} t={t} />
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

          <LessonNav previous={previous} next={next} />
        </aside>
```

Ширина зоны поднята с `lg:w-72` до `lg:w-80`: в 288 пикселях теория читается
плохо. Настоящее решение — тянущиеся разделители из §9, они делаются следующей
работой.

- [x] **Step 6: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: typecheck без вывода, тесты PASS.

- [x] **Step 7: Коммит**

```bash
git add components/lesson "app/[locale]/lesson" components/simulator/lesson-workspace.tsx
git commit -m "feat: теория урока и переход по курсу"
```

---

## Task 6: Сквозные тесты

**Files:**
- Create: `tests/e2e/course.spec.ts`

- [x] **Step 1: Написать тесты**

Создать `tests/e2e/course.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('первая страница показывает карту курса', async ({ page }) => {
  await page.goto('/ru');

  await expect(page.getByRole('heading', { name: 'Основы работы с коботом' })).toBeVisible();
  // Заголовок урока приходит из фронтматтера, а не из файла переводов.
  await expect(page.getByText('Инструмент и захват')).toBeVisible();
});

test('из карты курса открывается урок', async ({ page }) => {
  await page.goto('/ru');
  await page.getByRole('link', { name: /Инструмент и захват/ }).click();

  await expect(page).toHaveURL(/\/lesson\/instrument-i-zahvat/);
  await expect(page.getByTestId('block-editor')).toBeVisible({ timeout: 30_000 });
});

test('на экране урока видна теория', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  await expect(page.getByRole('heading', { name: 'Инструмент и захват' })).toBeVisible();
  // Текст из MDX, а не из интерфейса: проверяем, что содержание доехало.
  await expect(page.getByText(/центром инструмента/)).toBeVisible();
});

test('последний урок честно говорит, что он последний', async ({ page }) => {
  await page.goto('/ru/lesson/instrument-i-zahvat');

  // Урок пока единственный: и «назад», и «дальше» вести некуда.
  await expect(page.getByTestId('lesson-nav')).toBeVisible();
  await expect(page.getByText('Это последний урок курса')).toBeVisible();
});
```

- [x] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/course.spec.ts`
Expected: PASS, 4 теста.

- [x] **Step 3: Коммит**

```bash
git add tests/e2e/course.spec.ts
git commit -m "test: карта курса, теория и переход"
```

---

## Task 7: Проверка целиком

**Files:** нет

- [x] **Step 1: Типы**

Run: `npm run typecheck`
Expected: без вывода.

- [x] **Step 2: Unit**

Run: `npm test`
Expected: PASS, не меньше прежних 356 плюс 8 новых.

- [x] **Step 3: E2E**

Run: `npx playwright test`
Expected: PASS, прежние 28 плюс 4 новых.

- [x] **Step 4: Проверить главное требование §7**

Создать папку `content/courses/osnovy-raboty-s-kobotom/lessons/05-proverka/`, а в
ней `lesson.ru.mdx`:

```mdx
---
title: Проверочный урок
description: Временный урок, чтобы убедиться, что содержание подхватывается само.
minutes: 2
---

Если этот текст виден на экране урока, а сам урок появился в карте курса, то
требование §7 выполнено: содержание добавилось без единой правки кода.
```

Туда же скопировать `task.json` и `starter.json` из урока 4:

```bash
cd content/courses/osnovy-raboty-s-kobotom/lessons
cp 04-instrument-i-zahvat/task.json 04-instrument-i-zahvat/starter.json 05-proverka/
```

Открыть карту курса.

Ожидание: урок появился в списке вторым, открывается, из четвёртого урока на
него ведёт «дальше». **Кода не тронуто ни строки.**

После проверки папку удалить.

- [ ] **Step 5: Посмотреть глазами**

Открыть первую страницу и урок: карта читается, теория не жмётся, переход виден.

- [ ] **Step 6: Закрыть ветку**

Использовать `superpowers:finishing-a-development-branch`.
