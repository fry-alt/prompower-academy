'use client';

import { useEffect, useState } from 'react';
import { LoadingManager, type Object3D } from 'three';
import URDFLoader, { type URDFRobot } from 'urdf-loader';
import { clampJointVector, type JointLimit, type RobotPlugin } from '@prompower/sim-core';
import { applyPalette, disposeRobot } from './apply-palette';
import { measureRobot, type RobotBounds } from './fit-robot';
import { withGltfSupport } from './gltf-mesh-loader';
import { applyJointValues } from './pose-robot';
import { extractJointLimits } from './urdf-limits';

export type UrdfLoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly robot: URDFRobot;
      readonly limits: readonly JointLimit[];
      readonly bounds: RobotBounds;
      readonly loadMs: number;
    }
  | { readonly status: 'error'; readonly error: Error };

/**
 * Грузит URDF плагина и приводит его к виду, пригодному для сцены.
 *
 * URDF описан в системе координат Z вверх, three.js работает с Y вверх, поэтому
 * корень робота разворачивается на четверть оборота вокруг X.
 *
 * `urdf-loader` сообщает о готовности сразу после разбора XML, когда меши ещё
 * летят по сети. Мерить в этот момент нечего: габариты выйдут пустыми, а время
 * загрузки — заниженным. Поэтому ждём, пока закроются все запросы мешей.
 */
export function useUrdfRobot(plugin: RobotPlugin): UrdfLoadState {
  const [state, setState] = useState<UrdfLoadState>({ status: 'loading' });

  useEffect(() => {
    // Смена модели без размонтирования: прежний робот уже отдан на утилизацию
    // в очистке эффекта, и показывать его до загрузки нового нельзя.
    setState({ status: 'loading' });

    let cancelled = false;
    let ready: URDFRobot | null = null;
    let parsed: URDFRobot | null = null;
    let pendingMeshes = 0;
    const startedAt = performance.now();

    const manager = new LoadingManager();
    const loader = new URDFLoader(manager);
    loader.packages = { ...plugin.packages };

    const loadMesh = withGltfSupport(loader.loadMeshCb);
    loader.loadMeshCb = (url, meshManager, material, onMeshLoad) => {
      pendingMeshes += 1;
      loadMesh(url, meshManager, material, (mesh: Object3D, error?: Error) => {
        onMeshLoad(mesh, error);
        pendingMeshes -= 1;
        finishIfComplete();
      });
    };

    function finishIfComplete(): void {
      if (cancelled || parsed === null || pendingMeshes > 0) return;

      const robot = parsed;
      parsed = null;

      try {
        const limits = extractJointLimits(robot, plugin.joints);
        applyPalette(robot, plugin.palette, plugin.chainColors, plugin.joints);
        robot.rotation.x = -Math.PI / 2;

        // Габариты меряем в домашней позе, а не в нулевой: кадр камеры должен
        // подходить к тому, что пользователь увидит при первом открытии.
        const home = clampJointVector(limits, [...plugin.homePose]);
        applyJointValues(robot, plugin.joints.map((joint) => joint.urdfName), home);

        // Аккуратный URDF уже стоит основанием на нуле, и подъём выйдет нулевым.
        // Но модели встречаются с монтажной плитой, уходящей ниже начала координат.
        const bounds = measureRobot(robot);
        robot.position.y = bounds.liftY;

        ready = robot;
        setState({
          status: 'ready',
          robot,
          limits,
          bounds,
          loadMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        disposeRobot(robot);
        setState({ status: 'error', error: toError(error) });
      }
    }

    loader.load(
      plugin.urdfUrl,
      (robot) => {
        if (cancelled) {
          disposeRobot(robot);
          return;
        }
        parsed = robot;
        finishIfComplete();
      },
      undefined,
      (error) => {
        if (cancelled) return;
        setState({ status: 'error', error: toError(error) });
      },
    );

    return () => {
      cancelled = true;
      if (ready !== null) disposeRobot(ready);
    };
  }, [plugin]);

  return state;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(String(value));
}
