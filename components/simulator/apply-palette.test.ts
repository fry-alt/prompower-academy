import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshPhongMaterial, Object3D } from 'three';
import type { JointDescriptor, RobotPalette } from '@prompower/sim-core';
import { applyPalette } from './apply-palette';

/**
 * Проверка идёт на макете структуры, которую строит urdf-loader: звенья и
 * суставы вложены друг в друга, у каждого звена свой материал. Настоящий
 * URDFRobot для этого поднимать не нужно — важна только форма дерева.
 */

const PALETTE: RobotPalette = { base: '#ffffff', joint: '#000000', accent: '#ff0000' };

const JOINTS: JointDescriptor[] = [
  { urdfName: 'joint_1', labelKey: 'a' },
  { urdfName: 'joint_2', labelKey: 'b' },
];

interface Fake {
  readonly robot: Object3D & { joints: Record<string, Object3D | undefined> };
  readonly meshes: readonly Mesh[];
}

/** Собирает цепь: основание → сустав → звено → сустав → звено. */
function buildFakeRobot(linkNames: readonly string[]): Fake {
  const meshes: Mesh[] = [];

  const makeLink = (name: string): Object3D => {
    const link = new Object3D();
    link.name = name;
    Object.defineProperty(link, 'isURDFLink', { value: true });

    const visual = new Object3D();
    const mesh = new Mesh(new BoxGeometry(), new MeshPhongMaterial());
    meshes.push(mesh);
    visual.add(mesh);
    link.add(visual);
    return link;
  };

  const robot = new Object3D() as Object3D & { joints: Record<string, Object3D | undefined> };
  robot.joints = {};

  let parent = makeLink(linkNames[0] ?? 'base');
  robot.add(parent);

  JOINTS.forEach((descriptor, index) => {
    const joint = new Object3D();
    joint.name = descriptor.urdfName;
    Object.defineProperty(joint, 'isURDFJoint', { value: true });
    parent.add(joint);

    const link = makeLink(linkNames[index + 1] ?? `link${index}`);
    joint.add(link);

    robot.joints[descriptor.urdfName] = joint;
    parent = link;
  });

  return { robot, meshes };
}

function colorOf(mesh: Mesh): string {
  const material = mesh.material as MeshPhongMaterial;
  return `#${material.color.getHexString()}`;
}

describe('applyPalette', () => {
  it('красит звенья по порядку цепи, а не по именам', () => {
    const { robot, meshes } = buildFakeRobot(['Link_0', 'Link_1', 'Link_2']);

    const painted = applyPalette(robot, PALETTE, ['joint', 'base', 'accent'], JOINTS);

    expect(painted).toBe(3);
    expect(meshes.map(colorOf)).toEqual(['#000000', '#ffffff', '#ff0000']);
  });

  it('даёт тот же результат при другом соглашении об именах', () => {
    // В одной серии JAKA встречаются Link_0, Link_01, Link1 и Empty_Link0.
    const { robot, meshes } = buildFakeRobot(['Empty_Link0', 'Link_01', 'link2']);

    applyPalette(robot, PALETTE, ['joint', 'base', 'accent'], JOINTS);

    expect(meshes.map(colorOf)).toEqual(['#000000', '#ffffff', '#ff0000']);
  });

  it('не закрашивает дочернее звено цветом родительского', () => {
    const { robot, meshes } = buildFakeRobot(['a', 'b', 'c']);

    applyPalette(robot, PALETTE, ['joint', 'joint', 'accent'], JOINTS);

    expect(colorOf(meshes[2]!)).toBe('#ff0000');
  });

  it('включает тени всей модели', () => {
    const { robot, meshes } = buildFakeRobot(['a', 'b', 'c']);

    applyPalette(robot, PALETTE, ['joint', 'base', 'accent'], JOINTS);

    expect(meshes.every((mesh) => mesh.castShadow && mesh.receiveShadow)).toBe(true);
  });

  it('пропускает лишние цвета, если суставов меньше', () => {
    const { robot } = buildFakeRobot(['a', 'b', 'c']);

    const painted = applyPalette(robot, PALETTE, ['joint', 'base', 'accent', 'base'], JOINTS);

    expect(painted).toBe(3);
  });
});
