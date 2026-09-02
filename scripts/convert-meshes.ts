/**
 * Подготовка мешей робота к вебу: сжатие Draco и отчёт по размерам.
 *
 * Задача — чтобы добавление новой модели было одной командой (§4.1 брифа):
 *
 *   npm run convert-meshes -- <плагин> [--budget-mb 3]
 *
 * Скрипт берёт `packages/robot-plugins/<плагин>/meshes`, складывает результат в
 * `public/models/<плагин>/meshes` и печатает, во что уложились. Бюджет на полную
 * модель — 3 МБ; превышение возвращает ненулевой код, чтобы это ловилось в CI.
 *
 * Формат входа: .gltf и .glb. STL, DAE и STEP из ROS-пакетов сначала надо
 * перегнать в glTF внешним конвертером — скрипт скажет, чем именно, и не станет
 * молча пропускать файл.
 */

import { mkdir, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const DEFAULT_BUDGET_MB = 3;
const CONVERTIBLE = new Set(['.gltf', '.glb']);
const NEEDS_EXTERNAL_TOOL = new Set(['.stl', '.dae', '.step', '.stp', '.obj']);

interface Options {
  readonly plugin: string;
  readonly budgetBytes: number;
}

interface ConvertedMesh {
  readonly name: string;
  readonly beforeBytes: number;
  readonly afterBytes: number;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(import.meta.dirname, '..');
  const sourceDir = join(repoRoot, 'packages', 'robot-plugins', options.plugin, 'meshes');
  const targetDir = join(repoRoot, 'public', 'models', options.plugin, 'meshes');

  const sources = await listMeshes(sourceDir);
  if (sources.length === 0) {
    process.stdout.write(`В ${sourceDir} нет мешей для конвертации.\n`);
    return 0;
  }

  await mkdir(targetDir, { recursive: true });

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });

  const converted: ConvertedMesh[] = [];
  for (const source of sources) {
    const document = await io.read(source);
    await document.transform(dedup(), prune(), weld(), draco());

    const outputName = `${basename(source, extname(source))}.glb`;
    const outputPath = join(targetDir, outputName);
    await io.write(outputPath, document);

    converted.push({
      name: outputName,
      beforeBytes: (await stat(source)).size,
      afterBytes: (await stat(outputPath)).size,
    });
  }

  return report(converted, options.budgetBytes, targetDir);
}

function parseArgs(argv: readonly string[]): Options {
  const plugin = argv.find((arg) => !arg.startsWith('--'));
  if (plugin === undefined) {
    throw new Error(
      'Укажите каталог плагина: npm run convert-meshes -- <плагин> [--budget-mb 3]',
    );
  }

  const budgetIndex = argv.indexOf('--budget-mb');
  const budgetMb = budgetIndex === -1 ? DEFAULT_BUDGET_MB : Number(argv[budgetIndex + 1]);
  if (!Number.isFinite(budgetMb) || budgetMb <= 0) {
    throw new Error(`--budget-mb ожидает положительное число, получено «${argv[budgetIndex + 1]}»`);
  }

  return { plugin, budgetBytes: budgetMb * 1024 * 1024 };
}

async function listMeshes(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new Error(`Каталог мешей не найден: ${dir}`);
  }

  const blocked = entries.filter((name) => NEEDS_EXTERNAL_TOOL.has(extname(name).toLowerCase()));
  if (blocked.length > 0) {
    throw new Error(
      `Эти файлы надо сначала перегнать в glTF (например, через assimp или Blender): ${blocked.join(', ')}`,
    );
  }

  return entries
    .filter((name) => CONVERTIBLE.has(extname(name).toLowerCase()))
    .map((name) => join(dir, name));
}

function report(meshes: readonly ConvertedMesh[], budgetBytes: number, targetDir: string): number {
  const before = meshes.reduce((sum, mesh) => sum + mesh.beforeBytes, 0);
  const after = meshes.reduce((sum, mesh) => sum + mesh.afterBytes, 0);

  for (const mesh of meshes) {
    process.stdout.write(
      `  ${mesh.name.padEnd(32)} ${mb(mesh.beforeBytes)} -> ${mb(mesh.afterBytes)}\n`,
    );
  }
  process.stdout.write(`Итого ${mb(before)} -> ${mb(after)}, записано в ${targetDir}\n`);

  if (after > budgetBytes) {
    process.stderr.write(
      `Модель не уложилась в бюджет ${mb(budgetBytes)}: первая загрузка урока будет заметной.\n`,
    );
    return 1;
  }
  return 0;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
