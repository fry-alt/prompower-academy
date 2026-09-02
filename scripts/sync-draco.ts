/**
 * Кладёт декодер Draco из пакета three в `public/draco`.
 *
 * `DRACOLoader` подтягивает декодер отдельным файлом в рантайме. Брать его с
 * чужого CDN нельзя — хостинг только российский, — а держать копию в репозитории
 * значит однажды разойтись с версией three. Поэтому копируем на postinstall.
 */

import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

async function main(): Promise<void> {
  // three не выставляет package.json в exports, поэтому идём от точки входа пакета.
  const threeRoot = dirname(dirname(require.resolve('three')));
  const source = join(threeRoot, 'examples', 'jsm', 'libs', 'draco', 'gltf');
  const target = resolve(import.meta.dirname, '..', 'public', 'draco');

  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
  process.stdout.write(`Декодер Draco скопирован в ${target}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
