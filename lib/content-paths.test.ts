import { describe, expect, it } from 'vitest';
import { lessonFileFor, orderOf, slugOf } from './content-paths';

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
