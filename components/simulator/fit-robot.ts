'use client';

import { Box3, Vector3, type Object3D } from 'three';

/**
 * Габариты загруженной модели: по ним робот ставится на стол и кадрируется камера.
 *
 * Ни одна из этих величин не задаётся в конфиге плагина — они меряются по самой
 * модели. Иначе на каждую новую модель пришлось бы подбирать числа руками, а у
 * разных коботов вылет отличается втрое.
 */
export interface RobotBounds {
  /** Насколько поднять робота, чтобы ничего не оказалось ниже столешницы, метры. */
  readonly liftY: number;
  /** Радиус описывающей сферы, метры. Основа для дистанции камеры. */
  readonly radius: number;
  /** Высота центра модели над столешницей, метры. Туда смотрит камера. */
  readonly centerY: number;
}

export function measureRobot(root: Object3D): RobotBounds {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);

  if (box.isEmpty()) {
    // Модель без видимой геометрии — не падаем, просто не двигаем и не приближаем.
    return { liftY: 0, radius: 1, centerY: 0 };
  }

  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  return {
    // У аккуратного URDF основание уже стоит на нуле и подъём выходит нулевым.
    liftY: Math.max(0, -box.min.y),
    radius: Math.max(size.length() / 2, 0.1),
    centerY: center.y + Math.max(0, -box.min.y),
  };
}

/**
 * Расширяет рамку так, чтобы в кадр попала вся рабочая область задания.
 *
 * По одному роботу кадр строить нельзя: деталь и зоны лежат в стороне от него, и
 * ученик их просто не увидит. Точки сцены приходят в системе URDF, где вверх —
 * ось Z, поэтому здесь же делается тот самый разворот в оси three.js.
 */
export function includeScene(
  bounds: RobotBounds,
  points: readonly { readonly position: Vec3Like; readonly size: Vec3Like }[],
): RobotBounds {
  let radius = bounds.radius;

  for (const item of points) {
    const distance = Math.hypot(item.position.x, item.position.z, item.position.y);
    const half = Math.hypot(item.size.x, item.size.z, item.size.y) / 2;
    radius = Math.max(radius, distance + half);
  }

  return { ...bounds, radius };
}

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
