import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { compileMDX } from 'next-mdx-remote/rsc';
import type { ReactElement } from 'react';
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
  /** Сценарий обучения. Урок без него — обычное дело. */
  readonly tour: Tour | null;
  readonly previous: LessonMeta | null;
  readonly next: LessonMeta | null;
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

    const folder = folderOf(meta);
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
      tour: await loadTour(root, files, locale),
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

/** Имя папки урока обратно из метаданных. */
function folderOf(meta: LessonMeta): string {
  if (meta.order === Number.MAX_SAFE_INTEGER) return meta.slug;
  return `${String(meta.order).padStart(2, '0')}-${meta.slug}`;
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
