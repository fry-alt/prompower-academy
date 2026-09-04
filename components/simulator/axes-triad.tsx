'use client';

import { useMemo, type ReactNode } from 'react';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { forwardKinematics, type KinematicChain } from '@prompower/sim-core';

/**
 * Оси координат в сцене: X красная, Y зелёная, Z синяя.
 *
 * Ориентация берётся матрицей прямой задачи, а не углами RPY: у `ry = ±90°`
 * разложение на углы вырождается, и стрелки прыгали бы там, где рука едет
 * ровно. Матрица приходит из той же функции, по которой считаются числа в
 * панели, — иначе стрелки показывали бы одно, а числа другое.
 */

const ORIGIN = new Vector3(0, 0, 0);

const AXES = [
  { direction: new Vector3(1, 0, 0), color: 0xe0564a },
  { direction: new Vector3(0, 1, 0), color: 0x5ac46b },
  { direction: new Vector3(0, 0, 1), color: 0x4a8fe0 },
] as const;

/**
 * Робот в сцене повёрнут на −90° вокруг X (`use-urdf-robot.ts`): URDF считает
 * вверх по Z, а three.js — по Y. Всё, что ставится по координатам симулятора,
 * живёт внутри такой же группы.
 */
function SimFrame({ children }: { children: ReactNode }) {
  return <group rotation={[-Math.PI / 2, 0, 0]}>{children}</group>;
}

function Triad({ size }: { size: number }) {
  return (
    <>
      {AXES.map(({ direction, color }) => (
        <arrowHelper
          key={color}
          args={[direction, ORIGIN, size, color, size * 0.28, size * 0.16]}
        />
      ))}
    </>
  );
}

/** Оси инструмента: показывают, куда смотрит фланец. */
export function FlangeTriad({
  chain,
  values,
  size,
}: {
  chain: KinematicChain;
  values: readonly number[];
  size: number;
}) {
  const placement = useMemo(() => {
    // Наши матрицы построчные, `fromArray` читает по столбцам — отсюда транспонирование.
    const matrix = new Matrix4().fromArray([...forwardKinematics(chain, values)]).transpose();
    const position = new Vector3();
    const quaternion = new Quaternion();
    matrix.decompose(position, quaternion, new Vector3());
    return { position, quaternion };
  }, [chain, values]);

  return (
    <SimFrame>
      <group position={placement.position} quaternion={placement.quaternion}>
        <Triad size={size} />
      </group>
    </SimFrame>
  );
}

/** Оси основания: показывают, относительно чего считаются числа в системе мира. */
export function BaseTriad({ size }: { size: number }) {
  return (
    <SimFrame>
      <Triad size={size} />
    </SimFrame>
  );
}
