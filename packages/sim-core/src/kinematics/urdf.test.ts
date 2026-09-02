import { describe, expect, it } from 'vitest';
import { flangePose, forwardKinematics, jointLimits } from './chain';
import { translationOf } from './transform';
import { parseUrdfChain, UrdfParseError } from './urdf';

/**
 * Модель повторяет строение URDF от JAKA: между `world` и основанием стоит
 * фиксированный сустав, за последним подвижным — фланец инструмента. Смещения
 * подобраны так, чтобы позу фланца можно было посчитать на бумаге.
 */
const URDF = `<?xml version="1.0"?>
<!-- комментарий, который парсер обязан пропустить -->
<robot name="test_arm">
  <link name="world"/>
  <joint name="fixed_base" type="fixed">
    <parent link="world"/><child link="Link_0"/>
    <origin xyz="0 0 0.1" rpy="0 0 0"/>
  </joint>
  <link name="Link_0"/>
  <joint name="joint_1" type="revolute">
    <parent link="Link_0"/><child link="Link_1"/>
    <origin xyz="0 0 0.2" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" effort="150" velocity="3.14"/>
  </joint>
  <link name="Link_1">
    <visual><geometry><mesh filename="package://x/Link_1.STL"/></geometry></visual>
  </link>
  <joint name="joint_2" type="revolute">
    <parent link="Link_1"/><child link="Link_2"/>
    <origin xyz="0.3 0 0" rpy="0 0 0"/>
    <axis xyz="0 1 0"/>
    <limit lower="-1.5" upper="1.5"/>
  </joint>
  <link name="Link_2"/>
  <joint name="tool_fixed" type="fixed">
    <parent link="Link_2"/><child link="tool0"/>
    <origin xyz="0 0 0.05" rpy="0 0 0"/>
  </joint>
  <link name="tool0"/>
  <gazebo><plugin filename="libgazebo_ros2_control.so"/></gazebo>
</robot>`;

const NAMES = ['joint_1', 'joint_2'];

function expectPoint(actual: { x: number; y: number; z: number }, x: number, y: number, z: number) {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
  expect(actual.z).toBeCloseTo(z, 9);
}

describe('parseUrdfChain', () => {
  it('берёт только названные подвижные суставы', () => {
    const chain = parseUrdfChain(URDF, NAMES);
    expect(chain.joints.map((joint) => joint.name)).toEqual(NAMES);
  });

  it('читает пределы из URDF', () => {
    expect(jointLimits(parseUrdfChain(URDF, NAMES))).toEqual([
      { name: 'joint_1', type: 'revolute', lower: -3.14, upper: 3.14 },
      { name: 'joint_2', type: 'revolute', lower: -1.5, upper: 1.5 },
    ]);
  });

  it('читает оси суставов', () => {
    const chain = parseUrdfChain(URDF, NAMES);
    expect(chain.joints[0]?.axis).toEqual({ x: 0, y: 0, z: 1 });
    expect(chain.joints[1]?.axis).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('вбирает фиксированный сустав между world и основанием', () => {
    const chain = parseUrdfChain(URDF, NAMES);
    expectPoint(translationOf(chain.baseOrigin), 0, 0, 0.1);
  });

  it('вбирает фланец инструмента за последним суставом', () => {
    const chain = parseUrdfChain(URDF, NAMES);
    expectPoint(translationOf(chain.toolOrigin), 0, 0, 0.05);
  });

  it('сообщает о суставе, которого нет в модели', () => {
    expect(() => parseUrdfChain(URDF, ['joint_1', 'joint_9'])).toThrow(
      /В URDF нет суставов: joint_9/,
    );
  });

  it('ловит порядок суставов, не совпадающий с деревом', () => {
    expect(() => parseUrdfChain(URDF, ['joint_2', 'joint_1'])).toThrow(
      /Порядок суставов в конфиге не совпадает/,
    );
  });

  it('отвергает неподдерживаемый тип сустава', () => {
    const planar = URDF.replace('name="joint_2" type="revolute"', 'name="joint_2" type="planar"');
    expect(() => parseUrdfChain(planar, NAMES)).toThrow(/тип «planar» симулятор не поддерживает/);
  });

  it('сообщает о поломанном XML понятным текстом', () => {
    expect(() => parseUrdfChain('<robot><joint></robot>', ['joint_1'])).toThrow(UrdfParseError);
  });

  it('требует корневой элемент robot', () => {
    expect(() => parseUrdfChain('<mesh/>', ['joint_1'])).toThrow(/нет корневого элемента <robot>/);
  });

  it('отвергает пустой список суставов', () => {
    expect(() => parseUrdfChain(URDF, [])).toThrow(/Не задано ни одного сустава/);
  });
});

describe('forwardKinematics', () => {
  const chain = parseUrdfChain(URDF, NAMES);

  it('в нулевой позе складывает смещения по цепи', () => {
    // 0.1 основание + 0.2 до первого сустава + 0.3 вылет + 0.05 фланец.
    expectPoint(translationOf(forwardKinematics(chain, [0, 0])), 0.3, 0, 0.35);
  });

  it('поворот первого сустава уводит вылет из X в Y', () => {
    expectPoint(translationOf(forwardKinematics(chain, [Math.PI / 2, 0])), 0, 0.3, 0.35);
  });

  it('поворот второго сустава кладёт фланец горизонтально', () => {
    expectPoint(translationOf(forwardKinematics(chain, [0, Math.PI / 2])), 0.35, 0, 0.3);
  });

  it('отдаёт ориентацию фланца вместе с положением', () => {
    const pose = flangePose(chain, [Math.PI / 2, 0]);
    expect(pose.rz).toBeCloseTo(Math.PI / 2, 9);
  });

  it('отвергает вектор не той длины', () => {
    expect(() => forwardKinematics(chain, [0])).toThrow(/Ожидалось 2 значений суставов/);
  });
});

describe('линейный сустав', () => {
  const prismatic = `<robot name="rail">
    <link name="base"/>
    <joint name="rail_1" type="prismatic">
      <parent link="base"/><child link="carriage"/>
      <origin xyz="0 0 0"/>
      <axis xyz="1 0 0"/>
      <limit lower="0" upper="0.5"/>
    </joint>
    <link name="carriage"/>
  </robot>`;

  it('двигает фланец вдоль оси, а не вращает', () => {
    const chain = parseUrdfChain(prismatic, ['rail_1']);
    expectPoint(translationOf(forwardKinematics(chain, [0.2])), 0.2, 0, 0);
  });
});
