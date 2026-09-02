/**
 * Забирает URDF и меши серии JAKA Zu из репозитория производителя.
 *
 *   npm run import-models              # все модели из списка ниже
 *   npm run import-models -- zu7 zu20  # только названные
 *
 * Исходные STL весят около 60 МБ и в репозитории не хранятся: там лежит только
 * результат конвертации в `public/models`. Скрипт нужен, когда модель надо
 * пересобрать или добавить новую.
 *
 * После импорта: `npm run convert-meshes -- --all`.
 *
 * Правовая сторона описана в `packages/robot-plugins/LICENSE-NOTICE.md`.
 * Коротко: файла лицензии в репозитории JAKA нет, использование временное.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const REPO = 'https://raw.githubusercontent.com/JAKARobotics/jaka_ros2/main/src/jaka_description';
const MODELS = ['zu5', 'zu7', 'zu12', 'zu15', 'zu18', 'zu20', 'zu30'];

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const models = requested.length > 0 ? requested : MODELS;

  for (const model of models) {
    await importModel(model);
  }

  process.stdout.write('Дальше: npm run convert-meshes -- --all\n');
}

async function importModel(model: string): Promise<void> {
  const slug = `jaka-${model}`;
  const root = join(resolve(import.meta.dirname, '..'), 'packages', 'robot-plugins', 'models', slug);

  const urdf = await fetchText(`${REPO}/urdf/jaka_${model}.urdf`);
  await writeFileEnsured(join(root, 'urdf', `${slug}.urdf`), urdf);

  // Имена файлов мешей у моделей разные, поэтому берём их из самого URDF.
  const meshes = [...urdf.matchAll(/filename="[^"]*\/([^/"]+\.stl)"/gi)].map((m) => m[1]!);
  const unique = [...new Set(meshes)];

  let bytes = 0;
  for (const mesh of unique) {
    const data = await fetchBinary(`${REPO}/meshes/jaka_${model}_meshes/${mesh}`);
    await writeFileEnsured(join(root, 'meshes', mesh), data);
    bytes += data.byteLength;
  }

  process.stdout.write(
    `  ${slug.padEnd(12)} ${unique.length} мешей, ${(bytes / 1048576).toFixed(1)} МБ\n`,
  );
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} — ${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchBinary(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} — ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

async function writeFileEnsured(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
