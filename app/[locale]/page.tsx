import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { loadCourses } from '@/lib/content';

/**
 * Карта курса.
 *
 * Раньше корень локали переадресовывал в песочницу: у обучающей платформы на
 * первой странице должен быть курс, а не отладочный стенд.
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
                  {/* Номер берём из позиции в списке, а не из префикса папки: в
                      курсе с одним написанным уроком «Урок 4» выглядел бы ошибкой. */}
                  <span className="shrink-0 font-mono text-xs text-ink-faint">
                    {t('lessonNumber', { number: index + 1 })}
                  </span>

                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-sm font-medium">{lesson.title}</span>
                    <span className="text-sm text-ink-dim">{lesson.description}</span>
                  </span>

                  <span className="shrink-0 font-mono text-xs text-ink-faint">
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
