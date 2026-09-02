import { Color, Mesh, MeshPhongMaterial, type Object3D } from 'three';
import type { JointDescriptor, RobotPalette, RobotPlugin } from '@prompower/sim-core';

/**
 * Красит робота в палитру плагина.
 *
 * Цвет назначается по позиции звена в кинематической цепи, а не по имени звена
 * или материала. Причина в исходных данных: в одной и той же серии JAKA звенья
 * называются `Link_0`, `Link_01`, `Link1` и `Empty_Link0`, а материалы во всех
 * URDF безымянные и белые. Порядок цепи при этом одинаков у всех.
 */

interface UrdfJointNode extends Object3D {
  readonly isURDFJoint?: true;
}

interface RobotWithJoints extends Object3D {
  readonly joints: Readonly<Record<string, UrdfJointNode | undefined>>;
}

/** Сколько звеньев удалось перекрасить. Меньше ожидаемого — конфиг разошёлся с URDF. */
export function applyPalette(
  robot: RobotWithJoints,
  palette: RobotPalette,
  chainColors: RobotPlugin['chainColors'],
  joints: readonly JointDescriptor[],
): number {
  let painted = 0;

  for (const [index, paletteKey] of chainColors.entries()) {
    const link = linkAtChainPosition(robot, joints, index);
    if (link === null) continue;
    if (paintLink(link, palette[paletteKey], paletteKey === 'accent')) painted += 1;
  }

  // Тени включаем всей модели, включая звенья, которых нет в палитре.
  robot.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  return painted;
}

/**
 * Звено на позиции `index`: 0 — основание (родитель первого сустава), дальше —
 * звено, которое двигает сустав с этим номером.
 */
function linkAtChainPosition(
  robot: RobotWithJoints,
  joints: readonly JointDescriptor[],
  index: number,
): Object3D | null {
  if (index === 0) {
    const first = joints[0];
    if (first === undefined) return null;
    return robot.joints[first.urdfName]?.parent ?? null;
  }

  const descriptor = joints[index - 1];
  if (descriptor === undefined) return null;

  const joint = robot.joints[descriptor.urdfName];
  return joint?.children.find(isUrdfLink) ?? null;
}

function paintLink(link: Object3D, color: string, glossy: boolean): boolean {
  let touched = false;

  // Дочерние звенья висят внутри этого же узла, но красятся своим цветом,
  // поэтому обход останавливается на границе следующего сустава.
  const visit = (object: Object3D): void => {
    if (object !== link && (isUrdfJoint(object) || isUrdfLink(object))) return;

    if (object instanceof Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof MeshPhongMaterial)) continue;
        material.color = new Color(color);
        material.shininess = glossy ? 60 : 20;
        material.needsUpdate = true;
        touched = true;
      }
    }

    for (const child of object.children) visit(child);
  };

  visit(link);
  return touched;
}

function isUrdfJoint(object: Object3D): boolean {
  return 'isURDFJoint' in object;
}

function isUrdfLink(object: Object3D): boolean {
  return 'isURDFLink' in object;
}

/** Освобождает геометрию и материалы модели: сцена живёт дольше одного робота. */
export function disposeRobot(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}
