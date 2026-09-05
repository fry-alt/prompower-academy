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
      title={lesson.meta.title}
      previous={lesson.previous}
      next={lesson.next}
      theory={<LessonTheory>{lesson.theory}</LessonTheory>}
    />
  );
}
