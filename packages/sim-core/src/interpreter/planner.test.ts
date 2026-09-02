import { describe, expect, it } from 'vitest';
import { flangePose } from '../kinematics/chain';
import { parseUrdfChain } from '../kinematics/urdf';
import { createPlanner } from './planner';
import { TICK_MS } from './run';

/**
 * Шесть осей, как у всех моделей в реестре. Меньше нельзя: движение по прямой
 * держит и положение, и ориентацию фланца, а трёхосевой руке степеней свободы
 * на это не хватает — она честно откажется на первой же промежуточной точке.
 *
 * Скорости суставов заданы разными, чтобы проверить, что время движения
 * считается по самому медленному.
 */
const ARM = `<robot name="arm">
  <link name="base"/>
  <joint name="j1" type="revolute">
    <parent link="base"/><child link="l1"/>
    <origin xyz="0 0 0.2"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" velocity="2"/>
  </joint>
  <link name="l1"/>
  <joint name="j2" type="revolute">
    <parent link="l1"/><child link="l2"/>
    <origin xyz="0 0 0.1"/><axis xyz="0 1 0"/>
    <limit lower="-1.5" upper="1.5" velocity="1"/>
  </joint>
  <link name="l2"/>
  <joint name="j3" type="revolute">
    <parent link="l2"/><child link="l3"/>
    <origin xyz="0 0 0.36"/><axis xyz="0 1 0"/>
    <limit lower="-2.5" upper="2.5" velocity="4"/>
  </joint>
  <link name="l3"/>
  <joint name="j4" type="revolute">
    <parent link="l3"/><child link="l4"/>
    <origin xyz="0 0 0.3"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" velocity="3"/>
  </joint>
  <link name="l4"/>
  <joint name="j5" type="revolute">
    <parent link="l4"/><child link="l5"/>
    <origin xyz="0 0 0.09"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0" velocity="3"/>
  </joint>
  <link name="l5"/>
  <joint name="j6" type="revolute">
    <parent link="l5"/><child link="l6"/>
    <origin xyz="0 0 0.08"/><axis xyz="0 0 1"/>
    <limit lower="-6.28" upper="6.28" velocity="3"/>
  </joint>
  <link name="l6"/>
</robot>`;

const chain = parseUrdfChain(ARM, ['j1', 'j2', 'j3', 'j4', 'j5', 'j6']);
const planner = createPlanner(chain);
const FULL = { speed: 1, acc: 1 };
/**
 * Согнутая рабочая поза. Прямая рука над основанием — двойное вырождение:
 * фланец выходит на ось первого сустава, а локоть распрямлён. Матрица Якоби там
 * теряет ранг, и движение по прямой честно обрывается. Реальные операторы такие
 * позы обходят, и отдельный тест ниже фиксирует, что мы про это не молчим.
 */
const HOME = [0, 0.9, -1.6, 0, 0.7, 0];

describe('planJoint', () => {
  it('доводит суставы ровно до цели', () => {
    const target = [0.5, 0.2, -0.4, 0.1, 0.3, 0.2];
    const result = planner.planJoint(HOME, target, FULL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.joints).toEqual(target);
  });

  it('время считается по самому медленному суставу, а не по самому быстрому', () => {
    // j2 идёт на 1 рад при скорости 1 рад/с, j3 на 2 рад при 4 рад/с.
    // Дольше всех работает j2: одна секунда.
    const result = planner.planJoint([0, 0, 0, 0, 0, 0], [0, 1, 2, 0, 0, 0], FULL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.ticks).toBe(1000 / TICK_MS);
  });

  it('скорость из программы растягивает движение', () => {
    const fast = planner.planJoint([0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], FULL);
    const slow = planner.planJoint([0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], { speed: 0.5, acc: 1 });

    expect(fast.ok && slow.ok).toBe(true);
    if (!fast.ok || !slow.ok) return;
    expect(slow.plan.ticks).toBe(fast.plan.ticks * 2);
  });

  it('промежуточные позы ведут от начала к цели', () => {
    const result = planner.planJoint([0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], FULL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const waypoints = result.plan.waypoints;
    expect(waypoints.length).toBeGreaterThan(1);
    expect(waypoints[waypoints.length - 1]).toEqual([0, 1, 0, 0, 0, 0]);

    // Каждая следующая точка ближе к цели, чем предыдущая.
    const values = waypoints.map((point) => point[1] ?? 0);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });

  it('отказывает при выходе за предел сустава и называет градусы', () => {
    const result = planner.planJoint(HOME, [0, 3.0, 0, 0, 0, 0], FULL);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.reason).toMatch(/Сустав j2 не поворачивается на 171\.9°/);
    expect(result.refusal.reason).toMatch(/предел от -85\.9° до 85\.9°/);
  });

  it('при отказе плана нет вовсе: робот не двигается наполовину', () => {
    const result = planner.planJoint(HOME, [0, 3.0, 0, 0, 0, 0], FULL);
    expect(result.ok).toBe(false);
  });

  it('отвергает вектор не той длины', () => {
    const result = planner.planJoint(HOME, [0, 0], FULL);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.reason).toMatch(/Ожидалось 6 значений суставов/);
  });

  it('движение на месте занимает хотя бы один тик', () => {
    const result = planner.planJoint(HOME, HOME, FULL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.ticks).toBeGreaterThanOrEqual(1);
  });
});

describe('planLinear', () => {
  it('приводит фланец в заданную точку', () => {
    const target = flangePose(chain, [0.4, 1.0, -1.4, 0.2, 0.6, 0.3]);
    const result = planner.planLinear(HOME, target, FULL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reached = flangePose(chain, result.plan.joints);
    expect(Math.hypot(reached.x - target.x, reached.y - target.y, reached.z - target.z)).toBeLessThan(
      0.001,
    );
  });

  it('ведёт фланец по прямой, а не как попало', () => {
    const start = flangePose(chain, HOME);
    const target = flangePose(chain, [0.4, 1.0, -1.4, 0.2, 0.6, 0.3]);

    const result = planner.planLinear(HOME, target, FULL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const segment = Math.hypot(target.x - start.x, target.y - start.y, target.z - start.z);

    for (const point of result.plan.waypoints) {
      const pose = flangePose(chain, point);
      const toStart = Math.hypot(pose.x - start.x, pose.y - start.y, pose.z - start.z);
      const toEnd = Math.hypot(pose.x - target.x, pose.y - target.y, pose.z - target.z);
      // На отрезке сумма расстояний до концов равна его длине.
      expect(toStart + toEnd).toBeLessThan(segment + 0.005);
    }
  });

  it('время считается по пройденному пути и скорости фланца', () => {
    const slowPlanner = createPlanner(chain, { linearSpeed: 0.1 });
    const start = flangePose(chain, HOME);
    const target = flangePose(chain, [0, 1.0, -1.5, 0, 0.6, 0]);
    const distance = Math.hypot(target.x - start.x, target.y - start.y, target.z - start.z);

    const result = slowPlanner.planLinear(HOME, target, FULL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.ticks).toBe(Math.round((distance / 0.1) * (1000 / TICK_MS)));
  });

  it('отказывается от недостижимой точки и говорит, где путь оборвался', () => {
    const result = planner.planLinear(HOME, { x: 3, y: 0, z: 0.2, rx: 0, ry: 0, rz: 0 }, FULL);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.reason).toMatch(/рабочей зоны|упирается/);
    expect(result.refusal.reason).toMatch(/обрывается на \d+% отрезка|рабочей зоны/);
  });

  it('промежуточные позы не выходят за пределы суставов', () => {
    const target = flangePose(chain, [0.4, 1.1, -1.5, 0.2, 0.6, 0.1]);
    const result = planner.planLinear(HOME, target, FULL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const point of result.plan.waypoints) {
      for (const [index, joint] of chain.joints.entries()) {
        expect(point[index]!).toBeGreaterThanOrEqual(joint.limit.lower - 1e-9);
        expect(point[index]!).toBeLessThanOrEqual(joint.limit.upper + 1e-9);
      }
    }
  });

  it('обрывается на вырожденной позе, а не делает вид, что всё хорошо', () => {
    // Рука почти выпрямлена и фланец сидит на оси первого сустава: у настоящего
    // робота движение по прямой отсюда тоже не пройдёт.
    const singular = [0, 0.3, -0.6, 0, 0.4, 0];
    const target = flangePose(chain, [0.2, 0.4, -0.5, 0.1, 0.3, 0.1]);

    const result = planner.planLinear(singular, target, FULL);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.reason).toMatch(/обрывается на \d+% отрезка/);
  });

  it('детерминирован', () => {
    const target = flangePose(chain, [0.1, 1.0, -1.5, 0.1, 0.6, 0]);
    expect(planner.planLinear(HOME, target, FULL)).toEqual(planner.planLinear(HOME, target, FULL));
  });

  it('не раздувает траекторию сверх потолка точек', () => {
    const tight = createPlanner(chain, { linearStep: 0.00001, maxWaypoints: 20 });
    const target = flangePose(chain, [0.4, 1.0, -1.4, 0.2, 0.6, 0.3]);

    const result = tight.planLinear(HOME, target, FULL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.waypoints.length).toBeLessThanOrEqual(20);
  });
});
