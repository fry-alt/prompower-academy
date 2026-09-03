import { describe, expect, it } from 'vitest';
import { flangePose, parseUrdfChain, type KinematicChain } from '@prompower/sim-core';
import { BLOCK_TYPES } from '@prompower/blocks';
import { fieldsFromJoints, seedJoints, teachKindOf } from './teach-pose';

/** Шестиосевая рука тех же пропорций, что в тестах кинематики ядра. */
const ARM = `<robot name="six_axis">
  <link name="base"/>
  <joint name="j1" type="revolute">
    <parent link="base"/><child link="l1"/>
    <origin xyz="0 0 0.15"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l1"/>
  <joint name="j2" type="revolute">
    <parent link="l1"/><child link="l2"/>
    <origin xyz="0 0 0.1"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0"/>
  </joint>
  <link name="l2"/>
  <joint name="j3" type="revolute">
    <parent link="l2"/><child link="l3"/>
    <origin xyz="0 0 0.36"/><axis xyz="0 1 0"/>
    <limit lower="-2.6" upper="2.6"/>
  </joint>
  <link name="l3"/>
  <joint name="j4" type="revolute">
    <parent link="l3"/><child link="l4"/>
    <origin xyz="0 0 0.3"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l4"/>
  <joint name="j5" type="revolute">
    <parent link="l4"/><child link="l5"/>
    <origin xyz="0 0 0.09"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0"/>
  </joint>
  <link name="l5"/>
  <joint name="j6" type="revolute">
    <parent link="l5"/><child link="l6"/>
    <origin xyz="0 0 0.08"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l6"/>
</robot>`;

const CHAIN: KinematicChain = parseUrdfChain(ARM, ['j1', 'j2', 'j3', 'j4', 'j5', 'j6']);
const REST = [0, 0.3, -0.6, 0, 0.3, 0];

describe('какой блок чему учится', () => {
  it('различает движение по осям и по прямой', () => {
    expect(teachKindOf(BLOCK_TYPES.moveJoint)).toBe('joints');
    expect(teachKindOf(BLOCK_TYPES.moveLinear)).toBe('pose');
    expect(teachKindOf(BLOCK_TYPES.gripper)).toBeNull();
  });
});

describe('поля блока в позу копии', () => {
  it('движение по осям берёт углы прямо из полей', () => {
    const seed = seedJoints(
      'joints',
      { J1: 90, J2: 0, J3: -45, J4: 0, J5: 0, J6: 180 },
      CHAIN,
      REST,
    );

    expect(seed.exact).toBe(true);
    expect(seed.joints[0]).toBeCloseTo(Math.PI / 2, 9);
    expect(seed.joints[2]).toBeCloseTo(-Math.PI / 4, 9);
  });

  it('углы за пределом сустава зажимаются пределом из URDF', () => {
    const seed = seedJoints('joints', { J1: 0, J2: 180, J3: 0, J4: 0, J5: 0, J6: 0 }, CHAIN, REST);

    expect(seed.joints[1]).toBeCloseTo(2.0, 9);
  });

  it('движение по прямой решает обратную задачу от записанной точки', () => {
    const fields = fieldsFromJoints('pose', REST, CHAIN);

    const seed = seedJoints('pose', fields, CHAIN, [0, 0, 0, 0, 0, 0]);

    expect(seed.exact).toBe(true);
    // Допуск в два миллиметра — не запас на всякий случай, а сумма двух
    // известных величин: миллиметр допуска у обратной задачи и округление поля
    // блока до целого миллиметра.
    const reached = fieldsFromJoints('pose', seed.joints, CHAIN);
    expect(Math.abs(reached.X! - fields.X!)).toBeLessThanOrEqual(2);
    expect(Math.abs(reached.Y! - fields.Y!)).toBeLessThanOrEqual(2);
    expect(Math.abs(reached.Z! - fields.Z!)).toBeLessThanOrEqual(2);
  });

  it('недостижимая точка не ломает обучение, а начинается с текущей позы', () => {
    const seed = seedJoints('pose', { X: 5000, Y: 0, Z: 0, RX: 180, RY: 0, RZ: 0 }, CHAIN, REST);

    expect(seed.exact).toBe(false);
    expect([...seed.joints]).toEqual(REST);
  });
});

describe('поза копии в поля блока', () => {
  it('движение по осям пишет градусы с десятыми', () => {
    const fields = fieldsFromJoints('joints', [Math.PI / 2, 0, -Math.PI / 4, 0, 0, 0], CHAIN);

    expect(fields).toEqual({ J1: 90, J2: 0, J3: -45, J4: 0, J5: 0, J6: 0 });
  });

  it('движение по прямой пишет миллиметры и градусы фланца', () => {
    const pose = flangePose(CHAIN, REST);
    const fields = fieldsFromJoints('pose', REST, CHAIN);

    expect(fields.X).toBe(Math.round(pose.x * 1000));
    expect(fields.Z).toBe(Math.round(pose.z * 1000));
    expect(fields.RY).toBeCloseTo((pose.ry * 180) / Math.PI, 1);
  });

  it('минус нуля в полях не бывает', () => {
    const fields = fieldsFromJoints('joints', [-1e-9, 0, 0, 0, 0, 0], CHAIN);

    expect(Object.is(fields.J1, -0)).toBe(false);
  });
});
