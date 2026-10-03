import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compileMDX } from 'next-mdx-remote/rsc';
import { parseTask, type Task } from '@prompower/sim-core';
import { cache, type ReactElement } from 'react';
import { FALLBACK_LOCALE, lessonFileFor, orderOf, slugOf, tourFileFor } from './content-paths';
import { parseTour, type Tour } from './tour';

export { lessonFileFor, orderOf, slugOf, tourFileFor } from './content-paths';

/**
 * Содержание курсов с диска.
 *
 * §7 брифа требует, чтобы уроки добавлялись без правки кода. Поэтому список
 * уроков не хранится нигде: он и есть содержимое каталога. Порядок живёт в
 * числовом префиксе папки — второго источника правды о порядке нет, и разойтись
 * им негде.
 */

const COURSES = join(process.cwd(), 'content', 'courses');

export interface LessonMeta {
  /** Адрес урока: имя папки без числового префикса. */
  readonly slug: string;
  /**
   * Имя папки как есть. Восстанавливать его из номера и адреса нельзя: папка
   * «1-…» или «100-…» после такого восстановления не находилась.
   */
  readonly folder: string;
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
  /**
   * Задание, уже разобранное.
   *
   * Разбор живёт здесь, а не на странице: битый файл курса должен ломать
   * сборку, и загрузчику всё равно надо знать, программное задание или ручное.
   * Второй, более слабый ответ на тот же вопрос однажды разошёлся бы с первым.
   */
  readonly task: Task;
  readonly starter: object;
  /** Сценарий обучения. Урок без него — обычное дело. */
  readonly tour: Tour | null;
  readonly previous: LessonMeta | null;
  readonly next: LessonMeta | null;
}

/**
 * Все курсы с уроками по порядку.
 *
 * Кэш на запрос: метаданные, урок и заголовок страницы спрашивают каталог
 * каждый по-своему, и без кэша фронтматтер всех уроков компилировался трижды.
 */
export const loadCourses = cache(async (locale: string): Promise<Course[]> => {
  const slugs = await subdirectories(COURSES);

  return Promise.all(slugs.map((slug) => loadCourse(slug, locale)));
});

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
export const loadLesson = cache(async (slug: string, locale: string): Promise<Lesson | null> => {
  const courses = await loadCourses(locale);

  for (const course of courses) {
    const index = course.lessons.findIndex((lesson) => lesson.slug === slug);
    if (index === -1) continue;

    const meta = course.lessons[index];
    if (meta === undefined) continue;

    const root = join(COURSES, course.slug, 'lessons', meta.folder);
    const files = await readdir(root);
    const file = lessonFileFor(files, locale);
    if (file === null) return null;

    const { content } = await compileMDX({
      source: await readFile(join(root, file), 'utf8'),
      options: { parseFrontmatter: true },
    });

    const task = parseTask(JSON.parse(await readFile(join(root, 'task.json'), 'utf8')));

    return {
      meta,
      theory: content,
      task,
      starter: await loadStarter(root, task.mode === 'jog'),
      tour: await loadTour(root, files, locale),
      previous: course.lessons[index - 1] ?? null,
      next: course.lessons[index + 1] ?? null,
    };
  }

  return null;
});

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

  if (typeof frontmatter.description !== 'string') {
    throw new Error(`У урока ${folder} во фронтматтере нет description`);
  }

  return {
    slug: slugOf(folder),
    folder,
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

/**
 * Стартовая программа урока.
 *
 * Понятие программного урока: в ручном задании программы нет вовсе, и файла
 * рядом с ним не лежит. Пустой холст — честный ответ на его отсутствие.
 *
 * Программному уроку файл по-прежнему обязателен. Иначе опечатка в имени
 * проходила бы сборку и выкатывала урок с пустым редактором — а задание, в
 * котором ждут готовых блоков, молча стало бы непроходимым.
 */
async function loadStarter(root: string, optional: boolean): Promise<object> {
  try {
    return JSON.parse(await readFile(join(root, 'starter.json'), 'utf8')) as object;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (missing && optional) return {};
    throw error;
  }
}

/**
 * Сценарий обучения урока.
 *
 * Разбирается здесь, а не на экране: ошибка в файле должна падать при сборке
 * страницы, а не посреди урока у ученика.
 */
async function loadTour(root: string, files: readonly string[], locale: string): Promise<Tour | null> {
  const file = tourFileFor(files, locale);
  if (file === null) return null;

  return parseTour(JSON.parse(await readFile(join(root, file), 'utf8')));
}
