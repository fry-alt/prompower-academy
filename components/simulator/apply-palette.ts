import { Color, Mesh, MeshPhongMaterial, type Object3D } from 'three';
import type { RobotPalette } from '@prompower/sim-core';

/**
 * Красит робота в палитру плагина.
 *
 * URDF задаёт три именованных материала — `pp_base`, `pp_joint`, `pp_accent`, —
 * и модель приезжает от заказчика в нейтральном сером. Цвета бренда живут в
 * конфиге плагина, поэтому смена палитры не требует правки URDF.
 */

const MATERIAL_TO_PALETTE_KEY: Readonly<Record<string, keyof RobotPalette>> = {
  pp_base: 'base',
  pp_joint: 'joint',
  pp_accent: 'accent',
};

/** Сколько материалов удалось перекрасить. Ноль означает, что URDF без именованных материалов. */
export function applyPalette(root: Object3D, palette: RobotPalette): number {
  let painted = 0;

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const paletteKey = MATERIAL_TO_PALETTE_KEY[material.name];
      if (paletteKey === undefined) continue;
      if (!(material instanceof MeshPhongMaterial)) continue;

      material.color = new Color(palette[paletteKey]);
      material.shininess = paletteKey === 'accent' ? 60 : 20;
      material.needsUpdate = true;
      painted += 1;
    }

    object.castShadow = true;
    object.receiveShadow = true;
  });

  return painted;
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
