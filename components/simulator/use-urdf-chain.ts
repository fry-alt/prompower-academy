'use client';

import { useEffect, useState } from 'react';
import { parseUrdfChain, type KinematicChain, type RobotPlugin } from '@prompower/sim-core';

/**
 * Кинематическая цепь модели для расчётов симулятора.
 *
 * Тот же файл URDF читает и `urdf-loader` для картинки — браузер отдаёт его из
 * кэша, повторной загрузки по сети не происходит. Разделение сознательное:
 * картинке нужна сцена three.js, симулятору — числа, и связывать их незачем.
 */

export type ChainState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly chain: KinematicChain }
  | { readonly status: 'error'; readonly error: Error };

export function useUrdfChain(plugin: RobotPlugin): ChainState {
  const [state, setState] = useState<ChainState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetch(plugin.urdfUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`${plugin.urdfUrl}: ${response.status}`);
        return response.text();
      })
      .then((xml) => {
        if (cancelled) return;
        const names = plugin.joints.map((joint) => joint.urdfName);
        setState({ status: 'ready', chain: parseUrdfChain(xml, names) });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [plugin]);

  return state;
}
