import { describe, expect, it } from 'vitest';
import type { JointDescriptor } from '@prompower/sim-core';
import { extractJointLimits, UrdfMismatchError, type UrdfRobotLike } from './urdf-limits';

const descriptors: JointDescriptor[] = [
  { urdfName: 'joint_1', labelKey: 'a' },
  { urdfName: 'joint_2', labelKey: 'b' },
];

const robot: UrdfRobotLike = {
  joints: {
    joint_1: { jointType: 'revolute', limit: { lower: -3.14, upper: 3.14 } },
    joint_2: { jointType: 'revolute', limit: { lower: -1.5, upper: 1.5 } },
    joint_extra: { jointType: 'fixed', limit: { lower: 0, upper: 0 } },
  },
};

describe('extractJointLimits', () => {
  it('возвращает пределы в порядке конфига плагина', () => {
    expect(extractJointLimits(robot, descriptors)).toEqual([
      { name: 'joint_1', type: 'revolute', lower: -3.14, upper: 3.14 },
      { name: 'joint_2', type: 'revolute', lower: -1.5, upper: 1.5 },
    ]);
  });

  it('игнорирует суставы URDF, которых нет в конфиге', () => {
    expect(extractJointLimits(robot, descriptors)).toHaveLength(2);
  });

  it('берёт тип сустава из URDF, а не из конфига', () => {
    // У Zu 12 суставы объявлены continuous, у остальных моделей серии — revolute.
    const continuous: UrdfRobotLike = {
      joints: { joint_1: { jointType: 'continuous', limit: { lower: 0, upper: 0 } } },
    };
    const limits = extractJointLimits(continuous, [{ urdfName: 'joint_1', labelKey: 'a' }]);
    expect(limits[0]?.type).toBe('continuous');
  });

  it('сообщает об отсутствующем суставе', () => {
    const missing: JointDescriptor[] = [{ urdfName: 'joint_9', labelKey: 'c' }];
    expect(() => extractJointLimits(robot, missing)).toThrow(UrdfMismatchError);
    expect(() => extractJointLimits(robot, missing)).toThrow(/joint_9: нет в URDF/);
  });

  it('сообщает о неподдерживаемом типе сустава', () => {
    const unsupported: JointDescriptor[] = [{ urdfName: 'joint_extra', labelKey: 'd' }];
    expect(() => extractJointLimits(robot, unsupported)).toThrow(
      /joint_extra: тип «fixed» не поддерживается/,
    );
  });

  it('собирает все расхождения в одну ошибку', () => {
    const broken: JointDescriptor[] = [
      { urdfName: 'joint_9', labelKey: 'c' },
      { urdfName: 'joint_extra', labelKey: 'd' },
    ];
    try {
      extractJointLimits(robot, broken);
      expect.unreachable('ожидалась ошибка');
    } catch (error) {
      expect(error).toBeInstanceOf(UrdfMismatchError);
      expect((error as UrdfMismatchError).mismatches).toHaveLength(2);
    }
  });
});
