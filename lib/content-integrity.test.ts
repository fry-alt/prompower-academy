import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { parseTask } from '@prompower/sim-core';
import { parseTour } from './tour';

/**
 * Каталог курсов целиком: то, что раньше ловила только прод-сборка.
 *
 * Двоеточие в описании урока ломало фронтматтер, а программный урок без
 * стартовой программы не собирался — и узнавали об этом при выкладке. Здесь
 * то же проверяется за доли секунды, без сборщика MDX.
 */

const COURSES = join(process.cwd(), 'content', 'courses');

const lessons = readdirSync(COURSES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((course) => {
    const root = join(COURSES, course.name, 'lessons');
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((lesson) => ({ name: `${course.name}/${lesson.name}`, root: join(root, lesson.name) }));
  });

function frontmatter(source: string): unknown {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (match === null) throw new Error('нет фронтматтера');
  return parseYaml(match[1]!);
}

describe.each(lessons)('урок $name', ({ root }) => {
  const files = readdirSync(root);

  it('фронтматтер теории разбирается и содержит заголовок и время чтения', () => {
    const theory = files.filter((file) => /^lesson\.[a-z]{2}\.mdx$/.test(file));
    expect(theory.length).toBeGreaterThan(0);

    for (const file of theory) {
      const meta = frontmatter(readFileSync(join(root, file), 'utf8')) as Record<string, unknown>;
      expect(typeof meta['title']).toBe('string');
      expect(typeof meta['description']).toBe('string');
      expect(typeof meta['minutes']).toBe('number');
    }
  });

  it('задание разбирается, а у программного есть стартовая программа', () => {
    const task = parseTask(JSON.parse(readFileSync(join(root, 'task.json'), 'utf8')));
    if (task.mode === 'program') {
      expect(existsSync(join(root, 'starter.json'))).toBe(true);
      JSON.parse(readFileSync(join(root, 'starter.json'), 'utf8'));
    }
  });

  it('сценарий обучения, если есть, разбирается', () => {
    for (const file of files.filter((name) => /^tour\.[a-z]{2}\.json$/.test(name))) {
      expect(() => parseTour(JSON.parse(readFileSync(join(root, file), 'utf8')))).not.toThrow();
    }
  });
});
