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
  return localeFileFor(files, locale, 'lesson', 'mdx');
}

/** Сценарий обучения на нужном языке. Урок без сценария — обычное дело. */
export function tourFileFor(files: readonly string[], locale: string): string | null {
  return localeFileFor(files, locale, 'tour', 'json');
}

function localeFileFor(
  files: readonly string[],
  locale: string,
  name: string,
  extension: string,
): string | null {
  const wanted = `${name}.${locale}.${extension}`;
  if (files.includes(wanted)) return wanted;

  const fallback = `${name}.${FALLBACK_LOCALE}.${extension}`;
  return files.includes(fallback) ? fallback : null;
}
