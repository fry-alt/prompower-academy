import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLOCK_DEFINITIONS, toAst, type BlockLike } from '@prompower/blocks';
import {
  checkTask,
  createPlanner,
  createRun,
  createWorld,
  parseTask,
  parseUrdfChain,
  runToCompletion,
} from '@prompower/sim-core';
import { jakaZu7 } from '@prompower/robot-plugins';

/**
 * Стартовые программы уроков, исполненные без браузера.
 *
 * Стартовая программа — первое, что ученик запускает. Если она падает на
 * первом же движении, урок сломан, даже когда эталонное решение проходит:
 * так было с уроком 6, где программа ехала по прямой из домашней позы прямо в
 * вырожденную. Здесь каждая стартовая программа обязана доработать до конца —
 * не выполнив задание (его ещё решать), но и без ошибки исполнения.
 */

const COURSE = 'content/courses/osnovy-raboty-s-kobotom/lessons';

const chain = parseUrdfChain(
  readFileSync('packages/robot-plugins/models/jaka-zu7/urdf/jaka-zu7.urdf', 'utf8'),
  jakaZu7.joints.map((joint) => joint.urdfName),
);
const planner = createPlanner(chain);

/** Значения полей по умолчанию: в сохранённом холсте Blockly их не пишет. */
const DEFAULTS = new Map<string, Record<string, unknown>>(
  (BLOCK_DEFINITIONS as readonly Record<string, unknown>[]).map((definition) => {
    const fields: Record<string, unknown> = {};
    for (const [key, args] of Object.entries(definition)) {
      if (!key.startsWith('args') || !Array.isArray(args)) continue;
      for (const arg of args as Record<string, unknown>[]) {
        if (typeof arg['name'] !== 'string') continue;
        const options = arg['options'] as [string, string][] | undefined;
        fields[arg['name']] = arg['value'] ?? arg['text'] ?? options?.[0]?.[1];
      }
    }
    return [definition['type'] as string, fields];
  }),
);

interface SavedBlock {
  readonly type: string;
  readonly fields?: Record<string, unknown>;
  readonly inputs?: Record<string, { block?: SavedBlock }>;
  readonly next?: { block?: SavedBlock };
}

/** Сохранённый холст Blockly как блоки, понятные `toAst`. */
function adapt(saved: SavedBlock | undefined): BlockLike | null {
  if (saved === undefined) return null;
  const fields = { ...DEFAULTS.get(saved.type), ...saved.fields };
  return {
    type: saved.type,
    getFieldValue: (name) => fields[name],
    getInputTargetBlock: (name) => adapt(saved.inputs?.[name]?.block),
    getNextBlock: () => adapt(saved.next?.block),
  };
}

const lessons = readdirSync(COURSE).filter((folder) => existsSync(join(COURSE, folder, 'starter.json')));

describe.each(lessons)('стартовая программа урока %s', (folder) => {
  const task = parseTask(JSON.parse(readFileSync(join(COURSE, folder, 'task.json'), 'utf8')));
  const starter = JSON.parse(readFileSync(join(COURSE, folder, 'starter.json'), 'utf8')) as {
    blocks: { blocks: SavedBlock[] };
  };

  it('собирается в одну цепочку и доходит до конца без ошибки исполнения', () => {
    expect(starter.blocks.blocks).toHaveLength(1);

    const program = toAst(adapt(starter.blocks.blocks[0]));
    const world = createWorld({ ...task.world, joints: [...(task.world.joints ?? jakaZu7.homePose)] });
    const result = runToCompletion(createRun(program, world), planner, { maxSteps: 20_000 });

    expect(result.error).toBeNull();
    expect(result.status).toBe('finished');

    // Проверка задания при этом работает и говорит по делу.
    const check = checkTask(task, program, result.world, result.log, chain);
    expect(Array.isArray(check.failures)).toBe(true);
  });
});
