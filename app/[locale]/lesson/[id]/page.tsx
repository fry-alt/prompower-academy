import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { parseTask } from '@prompower/sim-core';
import { LessonClient } from './lesson-client';

/**
 * Урок с интерактивным заданием.
 *
 * Задание и программа читаются из каталога курсов на сервере: приложение о
 * содержании урока ничего не знает, как и требует §7 брифа.
 */

const COURSES = join(process.cwd(), 'content', 'courses');

/** Пока курс один. Список появится вместе с базой в фазе 3. */
const LESSONS: Readonly<Record<string, string>> = {
  'instrument-i-zahvat': 'osnovy-raboty-s-kobotom/lessons/04-instrument-i-zahvat',
};

export function generateStaticParams() {
  return Object.keys(LESSONS).map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'lesson' });
  return { title: t('title'), description: t('description') };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const folder = LESSONS[id];
  if (folder === undefined) notFound();

  const [task, starter] = await Promise.all([
    readJson(join(COURSES, folder, 'task.json')),
    readJson(join(COURSES, folder, 'starter.json')),
  ]);

  // Задание разбираем на сервере: битый файл курса должен ломать сборку, а не
  // урок у ученика. Холст уходит на клиент как есть — его разбирает Blockly.
  return <LessonClient task={parseTask(task)} starter={starter as object} />;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}
