/**
 * Разбор имён в каталоге курсов: порядок, адрес урока, выбор языка.
 *
 * Вынесено из `content.ts` отдельным модулем, чтобы тесты не тянули за собой
 * сборщик MDX: его импорт стоит тридцать секунд, а весь остальной набор
 * укладывается в две.
 */

export const FALLBACK_LOCALE = 'ru';

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
