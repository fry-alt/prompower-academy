'use client';

import { useEffect, useState } from 'react';
import { LoadingManager } from 'three';
import URDFLoader, { type URDFRobot } from 'urdf-loader';
import type { JointLimit, RobotPlugin } from '@prompower/sim-core';
import { applyPalette, disposeRobot } from './apply-palette';
import { extractJointLimits } from './urdf-limits';

export type UrdfLoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly robot: URDFRobot;
      readonly limits: readonly JointLimit[];
      readonly loadMs: number;
    }
  | { readonly status: 'error'; readonly error: Error };

/**
 * Грузит URDF плагина и приводит его к виду, пригодному для сцены.
 *
 * URDF описан в системе координат Z вверх, three.js работает с Y вверх, поэтому
 * корень робота разворачивается на четверть оборота вокруг X.
 */
export function useUrdfRobot(plugin: RobotPlugin): UrdfLoadState {
  const [state, setState] = useState<UrdfLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let loaded: URDFRobot | null = null;
    const startedAt = performance.now();

    const manager = new LoadingManager();
    const loader = new URDFLoader(manager);
    loader.packages = { ...plugin.packages };

    loader.load(
      plugin.urdfUrl,
      (robot) => {
        if (cancelled) {
          disposeRobot(robot);
          return;
        }
        try {
          const limits = extractJointLimits(robot, plugin.joints);
          applyPalette(robot, plugin.palette);
          robot.rotation.x = -Math.PI / 2;
          loaded = robot;
          setState({
            status: 'ready',
            robot,
            limits,
            loadMs: Math.round(performance.now() - startedAt),
          });
        } catch (error) {
          disposeRobot(robot);
          setState({ status: 'error', error: toError(error) });
        }
      },
      undefined,
      (error) => {
        if (cancelled) return;
        setState({ status: 'error', error: toError(error) });
      },
    );

    return () => {
      cancelled = true;
      if (loaded !== null) disposeRobot(loaded);
    };
  }, [plugin]);

  return state;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(String(value));
}
