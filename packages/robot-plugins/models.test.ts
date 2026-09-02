import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertRobotPluginConsistent,
  clampJointVector,
  flangePose,
  parseUrdfChain,
  solveIk,
  type RobotPlugin,
} from '@prompower/sim-core';
import { robotPlugins } from './index';

/**
 * Проверка каждой модели из реестра на настоящем URDF.
 *
 * Модульные тесты кинематики написаны на выдуманных цепях — они проверяют
 * математику. Здесь проверяется другое: что разбор справляется с файлами от
 * производителя, а конфиг плагина не разошёлся с моделью. Именно на этом стыке
 * ломались предыдущие модели: сустав `continuous` вместо `revolute`, четыре
 * разных способа назвать звенья, фиксированный сустав между `world` и
 * основанием.
 */

const ROOT = dirname(fileURLToPath(import.meta.url));

function urdfOf(plugin: RobotPlugin): string {
  // urdfUrl указывает на собранный файл в public; исходник лежит рядом с плагином.
  const file = plugin.urdfUrl.split('/').pop()!;
  return readFileSync(join(ROOT, 'models', plugin.id, 'urdf', file), 'utf8');
}

describe.each(robotPlugins.map((plugin) => [plugin.id, plugin] as const))(
  'модель %s',
  (_id, plugin) => {
    it('конфиг плагина самосогласован', () => {
      expect(() => assertRobotPluginConsistent(plugin)).not.toThrow();
    });

    it('URDF разбирается в кинематическую цепь', () => {
      const chain = parseUrdfChain(urdfOf(plugin), plugin.joints.map((joint) => joint.urdfName));
      expect(chain.joints).toHaveLength(plugin.joints.length);
    });

    it('домашняя поза лежит внутри пределов из URDF', () => {
      const chain = parseUrdfChain(urdfOf(plugin), plugin.joints.map((joint) => joint.urdfName));
      const limits = chain.joints.map((joint) => joint.limit);

      expect(clampJointVector(limits, [...plugin.homePose])).toEqual([...plugin.homePose]);
    });

    it('фланец в домашней позе находится над столом и в пределах вылета', () => {
      const chain = parseUrdfChain(urdfOf(plugin), plugin.joints.map((joint) => joint.urdfName));
      const pose = flangePose(chain, [...plugin.homePose]);

      expect(Number.isFinite(pose.x)).toBe(true);
      expect(pose.z).toBeGreaterThan(-0.5);
      expect(Math.hypot(pose.x, pose.y, pose.z)).toBeLessThan(4);
    });

    it('обратная кинематика возвращает руку в позу, полученную прямой', () => {
      const chain = parseUrdfChain(urdfOf(plugin), plugin.joints.map((joint) => joint.urdfName));
      const limits = chain.joints.map((joint) => joint.limit);

      // Цель заведомо достижима: она взята из прямой кинематики этой же цепи.
      const reference = clampJointVector(
        limits,
        plugin.homePose.map((value) => value + 0.2),
      );
      const target = flangePose(chain, reference);

      const result = solveIk(chain, target, [...plugin.homePose], { maxIterations: 300 });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const reached = flangePose(chain, result.joints);
      expect(Math.hypot(reached.x - target.x, reached.y - target.y, reached.z - target.z)).toBeLessThan(
        0.001,
      );
    });
  },
);
