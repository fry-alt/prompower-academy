import { describe, expect, it } from 'vitest';
import { assertRobotPluginConsistent, RobotPluginError, type RobotPlugin } from './plugin';

const base: RobotPlugin = {
  id: 'test-robot',
  displayNameKey: 'robots.test.name',
  placeholderNoticeKey: 'robots.test.notice',
  urdfUrl: '/models/test/test.urdf',
  packages: {},
  joints: [
    { urdfName: 'j1', labelKey: 'robots.joints.base', type: 'revolute' },
    { urdfName: 'j2', labelKey: 'robots.joints.shoulder', type: 'revolute' },
  ],
  homePose: [0, 0.5],
  palette: { base: '#fff', joint: '#000', accent: '#f00' },
  scene: { tableHeight: 0.75, tableSize: [1, 1], cameraZoom: 2 },
};

describe('assertRobotPluginConsistent', () => {
  it('пропускает согласованный конфиг', () => {
    expect(() => assertRobotPluginConsistent(base)).not.toThrow();
  });

  it('ловит пустой список суставов', () => {
    expect(() => assertRobotPluginConsistent({ ...base, joints: [], homePose: [] })).toThrow(
      /не объявлено ни одного сустава/,
    );
  });

  it('ловит домашнюю позу не той длины', () => {
    expect(() => assertRobotPluginConsistent({ ...base, homePose: [0] })).toThrow(
      /не совпадает с 2 суставами/,
    );
  });

  it('ловит повторяющееся имя сустава', () => {
    const duplicated: RobotPlugin = {
      ...base,
      joints: [base.joints[0]!, base.joints[0]!],
    };
    expect(() => assertRobotPluginConsistent(duplicated)).toThrow(RobotPluginError);
  });

  it('ловит нечисловое значение в домашней позе', () => {
    expect(() => assertRobotPluginConsistent({ ...base, homePose: [0, Number.NaN] })).toThrow(
      /домашняя поза содержит NaN/,
    );
  });
});
