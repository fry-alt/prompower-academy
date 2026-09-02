'use client';

import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import * as Ru from 'blockly/msg/ru';
import { BLOCK_DEFINITIONS, TOOLBOX, toAst } from '@prompower/blocks';
import type { Program } from '@prompower/sim-core';

/**
 * Редактор блоков.
 *
 * Blockly трогает DOM напрямую, поэтому живёт в ref, а не в дереве React:
 * попытка перерисовывать холст пропсами кончается потерянными блоками при
 * каждом рендере родителя.
 *
 * Наружу отдаётся уже разобранный AST, а не рабочая область. Всё, что дальше —
 * симулятор, автопроверка, генерация Python, — работает с деревом и про Blockly
 * не знает.
 */

let registered = false;

/** Определения блоков глобальны для Blockly: регистрируем ровно один раз. */
function registerBlocks(): void {
  if (registered) return;
  Blockly.defineBlocksWithJsonArray([...BLOCK_DEFINITIONS] as never[]);
  registered = true;
}

export function BlockEditor({
  initial,
  onChange,
}: {
  /** Стартовое содержимое холста в формате сериализации Blockly. */
  initial?: object;
  onChange: (program: Program, error: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    const container = host.current;
    if (container === null) return;

    registerBlocks();
    Blockly.setLocale(Ru as unknown as Record<string, string>);

    const workspace = Blockly.inject(container, {
      toolbox: TOOLBOX,
      renderer: 'zelos',
      theme: DARK_THEME,
      grid: { spacing: 24, length: 3, colour: '#2a2f37', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.4, maxScale: 1.6 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
    });

    if (initial !== undefined) {
      Blockly.serialization.workspaces.load(initial, workspace);
    }

    const publish = (): void => {
      try {
        latest.current(toAst(workspace.getTopBlocks(true)[0] ?? null), null);
      } catch (error) {
        latest.current(
          { version: 1, body: [] },
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    publish();
    workspace.addChangeListener((event) => {
      // Перерисовки и выделение программу не меняют — на них не реагируем.
      if (event.isUiEvent) return;
      publish();
    });

    // Blockly не следит за размером контейнера сам.
    const observer = new ResizeObserver(() => Blockly.svgResize(workspace));
    observer.observe(container);

    return () => {
      observer.disconnect();
      workspace.dispose();
    };
  }, [initial]);

  return <div ref={host} className="h-full w-full" data-testid="block-editor" />;
}

/** Тёмная тема под остальной интерфейс: светлый холст рядом со сценой режет глаз. */
const DARK_THEME = Blockly.Theme.defineTheme('prompower', {
  name: 'prompower',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#1a1d22',
    toolboxBackgroundColour: '#20242a',
    toolboxForegroundColour: '#d8dce2',
    flyoutBackgroundColour: '#262b32',
    flyoutForegroundColour: '#d8dce2',
    flyoutOpacity: 1,
    scrollbarColour: '#3a4048',
    insertionMarkerColour: '#e08a3c',
    insertionMarkerOpacity: 0.5,
    cursorColour: '#e08a3c',
  },
});
