import { describe, expect, it } from 'vitest';
import { flangePose, forwardKinematics } from './chain';
import { alignToolDown, jogPose, jogToPose } from './jog';
import { parseUrdfChain } from './urdf';

/** Шестиосевая рука тех же пропорций, что в тестах обратной задачи. */
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
    <limit lower="-6.28" upper="6.28"/>
  </joint>
  <link name="l6"/>
</robot>`;

const chain = parseUrdfChain(ARM, ['j1', 'j2', 'j3', 'j4', 'j5', 'j6']);

const HOME = [0, 0.4, -0.8, 0, 0.4, 0];
/** Та же поза, развёрнутая первым суставом: система фланца заметно расходится с миром. */
const TURNED = [Math.PI / 2, 0.4, -0.8, 0, 0.4, 0];

/**
 * Поза, в которой инструмент смотрит строго вверх — худший случай для разворота
 * вниз: доворачивать ровно полоборота.
 *
 * У `HOME` рука почти вытянута вверх (вылет 1.02 при пределе 1.08), и удержать
 * ту же точку с инструментом вниз она физически не может: там `alignToolDown`
 * законно отказывает, и проверять на такой позе нечего.
 */
const UPRIGHT = [0, -1.4, -0.4, 0, 1.8, 0];

const STEP = 0.05;

/**
 * Обратная задача обещает 1 мм по положению, поэтому сравниваем с запасом:
 * `toBeCloseTo(x, 2)` — это «различие меньше 5 мм».
 */
const PLACES = 2;

describe('шаг по прямой', () => {
  it('в системе мира двигает фланец вдоль оси мира', () => {
    const before = flangePose(chain, HOME);

    const result = jogPose(chain, HOME, 'world', 'x', STEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x - before.x).toBeCloseTo(STEP, PLACES);
    expect(after.y - before.y).toBeCloseTo(0, PLACES);
    expect(after.z - before.z).toBeCloseTo(0, PLACES);
  });

  it('в системе фланца идёт вдоль оси инструмента, а не мира', () => {
    // Первый столбец матрицы — ось X инструмента в координатах мира.
    const m = forwardKinematics(chain, TURNED);
    const axis = { x: m[0] ?? 0, y: m[4] ?? 0, z: m[8] ?? 0 };
    const before = flangePose(chain, TURNED);

    const result = jogPose(chain, TURNED, 'flange', 'x', STEP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x - before.x).toBeCloseTo(STEP * axis.x, PLACES);
    expect(after.y - before.y).toBeCloseTo(STEP * axis.y, PLACES);
    expect(after.z - before.z).toBeCloseTo(STEP * axis.z, PLACES);
  });
});

describe('поворот', () => {
  it('в системе инструмента не сдвигает точку фланца', () => {
    const before = flangePose(chain, HOME);

    const result = jogPose(chain, HOME, 'flange', 'ry', 0.2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x).toBeCloseTo(before.x, PLACES);
    expect(after.y).toBeCloseTo(before.y, PLACES);
    expect(after.z).toBeCloseTo(before.z, PLACES);
  });

  it('в системе мира тоже не сдвигает точку фланца', () => {
    // Ось поворота проходит через фланец, а не через основание робота. Если
    // сопряжение потерять, рука уедет по дуге и этот тест поймает именно это.
    const before = flangePose(chain, HOME);

    const result = jogPose(chain, HOME, 'world', 'rz', 0.2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x).toBeCloseTo(before.x, PLACES);
    expect(after.y).toBeCloseTo(before.y, PLACES);
    expect(after.z).toBeCloseTo(before.z, PLACES);
  });
});

describe('инструмент вниз', () => {
  it('разворачивает инструмент из положения строго вверх строго вниз', () => {
    // Третий столбец матрицы — ось Z инструмента в координатах мира.
    expect(forwardKinematics(chain, UPRIGHT)[10] ?? 0).toBeCloseTo(1, PLACES);

    const result = alignToolDown(chain, UPRIGHT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const m = forwardKinematics(chain, result.joints);
    expect(m[2] ?? 0).toBeCloseTo(0, PLACES);
    expect(m[6] ?? 0).toBeCloseTo(0, PLACES);
    expect(m[10] ?? 0).toBeCloseTo(-1, PLACES);
  });

  it('не сдвигает точку фланца', () => {
    const before = flangePose(chain, UPRIGHT);

    const result = alignToolDown(chain, UPRIGHT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.x).toBeCloseTo(before.x, PLACES);
    expect(after.y).toBeCloseTo(before.y, PLACES);
    expect(after.z).toBeCloseTo(before.z, PLACES);
  });

  it('отказывает там, где рука не удержит точку с инструментом вниз', () => {
    // У `HOME` рука почти вытянута: развернуть инструмент, не сойдя с точки,
    // нельзя. Честный отказ здесь важнее натянутого успеха.
    const result = alignToolDown(chain, HOME);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unreachable');
  });
});

describe('отказ', () => {
  it('недостижимый шаг не меняет углы и объясняет причину', () => {
    const result = jogPose(chain, HOME, 'world', 'x', 5);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unreachable');
  });
});

describe('точная поза', () => {
  it('приводит фланец в заданную точку', () => {
    const home = flangePose(chain, HOME);
    const target = { ...home, z: home.z - 0.05 };

    const result = jogToPose(chain, HOME, target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = flangePose(chain, result.joints);
    expect(after.z).toBeCloseTo(target.z, PLACES);
  });
});
