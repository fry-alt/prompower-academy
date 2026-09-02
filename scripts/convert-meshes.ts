/**
 * Готовит модель робота к вебу одной командой (§4.1 брифа):
 *
 *   npm run convert-meshes -- <плагин> [--budget-mb 3]
 *   npm run convert-meshes -- --all
 *
 * Берёт исходники плагина
 *
 *   packages/robot-plugins/<плагин>/urdf/<имя>.urdf
 *   packages/robot-plugins/<плагин>/meshes/*.stl|*.glb|*.gltf
 *
 * и раскладывает готовое к раздаче
 *
 *   public/models/<плагин>/<имя>.urdf     ссылки на меши переписаны на meshes/*.glb
 *   public/models/<плагин>/meshes/*.glb   сжато Draco
 *
 * Исходные STL из ROS-пакетов весят десятки мегабайт; без сжатия первая загрузка
 * урока занимает секунды и убивает впечатление. Бюджет на модель — 3 МБ,
 * превышение возвращает ненулевой код, чтобы это ловилось в CI.
 *
 * DAE и STEP скрипт не берёт: их нужно сначала перегнать в STL или glTF внешним
 * конвертером. Молча пропускать файл он не станет.
 */

import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Document, NodeIO, type Transform } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const DEFAULT_BUDGET_MB = 3;
const STL = '.stl';
const GLTF = new Set(['.glb', '.gltf']);
const NEEDS_EXTERNAL_TOOL = new Set(['.dae', '.step', '.stp', '.obj', '.fbx']);

interface Options {
  readonly plugins: readonly string[];
  readonly budgetBytes: number;
}

interface ConvertedMesh {
  readonly name: string;
  readonly beforeBytes: number;
  readonly afterBytes: number;
}

async function main(): Promise<number> {
  const { plugins, budgetBytes } = await parseArgs(process.argv.slice(2));

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

  let worst = 0;
  for (const plugin of plugins) {
    process.stdout.write(`${plugin}\n`);
    worst = Math.max(worst, await convertPlugin(io, plugin, budgetBytes));
  }
  return worst;
}

async function convertPlugin(io: NodeIO, plugin: string, budgetBytes: number): Promise<number> {
  const sourceRoot = join(pluginsRoot(), plugin);
  const targetRoot = join(resolve(import.meta.dirname, '..'), 'public', 'models', plugin);

  const meshes = await convertMeshes(io, join(sourceRoot, 'meshes'), join(targetRoot, 'meshes'));
  await publishUrdf(join(sourceRoot, 'urdf'), targetRoot, meshes.length > 0);

  return report(meshes, budgetBytes, targetRoot);
}

function pluginsRoot(): string {
  return join(resolve(import.meta.dirname, '..'), 'packages', 'robot-plugins');
}

async function convertMeshes(
  io: NodeIO,
  sourceDir: string,
  targetDir: string,
): Promise<ConvertedMesh[]> {
  const sources = await listMeshes(sourceDir);
  if (sources.length === 0) return [];

  await mkdir(targetDir, { recursive: true });
  const pipeline: Transform[] = [dedup(), prune(), weld(), draco()];
  const converted: ConvertedMesh[] = [];

  for (const source of sources) {
    const name = basename(source, extname(source));
    const document =
      extname(source).toLowerCase() === STL ? await readStl(source, name) : await io.read(source);

    await document.transform(...pipeline);

    const outputPath = join(targetDir, `${name}.glb`);
    await io.write(outputPath, document);

    converted.push({
      name: `${name}.glb`,
      beforeBytes: (await stat(source)).size,
      afterBytes: (await stat(outputPath)).size,
    });
  }

  return converted;
}

/** STL несёт голый набор треугольников без индексов и материалов — собираем из него минимальный glTF. */
async function readStl(path: string, name: string): Promise<Document> {
  const file = await readFile(path);
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const geometry = new STLLoader().parse(bytes as ArrayBuffer);

  const position = geometry.getAttribute('position');
  if (position === undefined) {
    throw new Error(`${path}: в STL нет вершин`);
  }

  const document = new Document();
  const buffer = document.createBuffer();
  const primitive = document.createPrimitive().setAttribute(
    'POSITION',
    document
      .createAccessor('POSITION')
      .setType('VEC3')
      .setArray(Float32Array.from(position.array))
      .setBuffer(buffer),
  );

  const normal = geometry.getAttribute('normal');
  if (normal !== undefined) {
    primitive.setAttribute(
      'NORMAL',
      document
        .createAccessor('NORMAL')
        .setType('VEC3')
        .setArray(Float32Array.from(normal.array))
        .setBuffer(buffer),
    );
  }

  const mesh = document.createMesh(name).addPrimitive(primitive);
  document.createScene().addChild(document.createNode(name).setMesh(mesh));
  return document;
}

/**
 * Копирует URDF в public и переписывает ссылки на меши.
 *
 * В ROS-пакетах пути выглядят как `package://<пакет>/meshes/link_1.STL`. После
 * конвертации всё лежит рядом с URDF, поэтому ссылка становится относительной и
 * настраивать `loader.packages` под каждую модель не нужно.
 */
async function publishUrdf(
  sourceDir: string,
  targetRoot: string,
  rewriteMeshes: boolean,
): Promise<void> {
  const entries = (await readdir(sourceDir)).filter(
    (name) => extname(name).toLowerCase() === '.urdf',
  );
  if (entries.length === 0) {
    throw new Error(`В ${sourceDir} нет ни одного .urdf`);
  }

  await mkdir(targetRoot, { recursive: true });

  for (const entry of entries) {
    const source = join(sourceDir, entry);
    const target = join(targetRoot, entry);

    if (!rewriteMeshes) {
      await copyFile(source, target);
      continue;
    }

    const xml = await readFile(source, 'utf8');
    const rewritten = xml.replace(
      /filename="[^"]*?([^/"]+)\.(?:stl|dae|glb|gltf|obj)"/gi,
      (_match, name: string) => `filename="meshes/${name}.glb"`,
    );
    await writeFile(target, rewritten, 'utf8');
  }
}

async function parseArgs(argv: readonly string[]): Promise<Options> {
  const budgetIndex = argv.indexOf('--budget-mb');
  const budgetMb = budgetIndex === -1 ? DEFAULT_BUDGET_MB : Number(argv[budgetIndex + 1]);
  if (!Number.isFinite(budgetMb) || budgetMb <= 0) {
    throw new Error(`--budget-mb ожидает положительное число, получено «${argv[budgetIndex + 1]}»`);
  }

  const budgetBytes = budgetMb * 1024 * 1024;

  if (argv.includes('--all')) {
    const entries = await readdir(pluginsRoot(), { withFileTypes: true });
    return { plugins: entries.filter((e) => e.isDirectory()).map((e) => e.name), budgetBytes };
  }

  const plugin = argv.find((arg) => !arg.startsWith('--'));
  if (plugin === undefined) {
    throw new Error(
      'Укажите каталог плагина или --all: npm run convert-meshes -- <плагин> [--budget-mb 3]',
    );
  }

  return { plugins: [plugin], budgetBytes };
}

async function listMeshes(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // Модель может быть собрана из примитивов прямо в URDF — это не ошибка.
    return [];
  }

  const blocked = entries.filter((name) => NEEDS_EXTERNAL_TOOL.has(extname(name).toLowerCase()));
  if (blocked.length > 0) {
    throw new Error(
      `Эти файлы надо сначала перегнать в STL или glTF (assimp, Blender): ${blocked.join(', ')}`,
    );
  }

  return entries
    .filter((name) => {
      const ext = extname(name).toLowerCase();
      return ext === STL || GLTF.has(ext);
    })
    .map((name) => join(dir, name));
}

function report(meshes: readonly ConvertedMesh[], budgetBytes: number, targetRoot: string): number {
  if (meshes.length === 0) {
    process.stdout.write(`Мешей нет, URDF скопирован в ${targetRoot}\n`);
    return 0;
  }

  const before = meshes.reduce((sum, mesh) => sum + mesh.beforeBytes, 0);
  const after = meshes.reduce((sum, mesh) => sum + mesh.afterBytes, 0);

  for (const mesh of meshes) {
    process.stdout.write(
      `  ${mesh.name.padEnd(24)} ${mb(mesh.beforeBytes)} -> ${mb(mesh.afterBytes)}\n`,
    );
  }
  process.stdout.write(`Итого ${mb(before)} -> ${mb(after)}, записано в ${targetRoot}\n`);

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
