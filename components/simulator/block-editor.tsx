'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import * as Blockly from 'blockly';
import * as Ru from 'blockly/msg/ru';
import { BLOCK_DEFINITIONS, TOOLBOX, toAst } from '@prompower/blocks';
import type { Program } from '@prompower/sim-core';
import { registerTeachExtension, TEACH_EVENT, type TeachEventDetail } from './teach-field';

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
  // Расширение обязано быть известно раньше блоков, которые на него ссылаются.
  registerTeachExtension();
  Blockly.defineBlocksWithJsonArray([...BLOCK_DEFINITIONS] as never[]);
  registered = true;
}

/** Просьба показать роботу точку: какой блок и что в нём сейчас записано. */
export interface TeachRequest {
  readonly blockId: string;
  readonly blockType: string;
  readonly fields: Readonly<Record<string, number>>;
}

export interface BlockEditorHandle {
  /** Записать значения полей в блок. Меняет программу так же, как ввод руками. */
  writeFields(blockId: string, fields: Readonly<Record<string, number>>): void;
}

export function BlockEditor({
  initial,
  onChange,
  onTeach,
  ref,
}: {
  /** Стартовое содержимое холста в формате сериализации Blockly. */
  initial?: object;
  onChange: (program: Program, error: string | null) => void;
  onTeach: (request: TeachRequest) => void;
  ref?: Ref<BlockEditorHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const teach = useRef(onTeach);
  teach.current = onTeach;

  useImperativeHandle(
    ref,
    () => ({
      writeFields(blockId, fields) {
        const block = workspaceRef.current?.getBlockById(blockId);
        if (block === undefined || block === null) return;

        for (const [name, value] of Object.entries(fields)) {
          if (block.getField(name) === null) continue;
          block.setFieldValue(value, name);
        }
      },
    }),
    [],
  );

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

    workspaceRef.current = workspace;

    const onTeachEvent = (event: Event): void => {
      const { blockId } = (event as CustomEvent<TeachEventDetail>).detail;
      const block = workspace.getBlockById(blockId);
      if (block === null) return;
      teach.current({ blockId: block.id, blockType: block.type, fields: numericFields(block) });
    };
    container.addEventListener(TEACH_EVENT, onTeachEvent);

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
      container.removeEventListener(TEACH_EVENT, onTeachEvent);
      workspaceRef.current = null;
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

/**
 * Числовые поля блока.
 *
 * Редактор не знает, что у движения по осям это J1…J6, а у прямой — X/Y/Z и
 * повороты: он отдаёт всё, что похоже на число, а разбирается с этим `teach-pose`.
 */
function numericFields(block: Blockly.Block): Record<string, number> {
  const fields: Record<string, number> = {};

  for (const input of block.inputList) {
    for (const field of input.fieldRow) {
      const name = field.name;
      if (name === undefined) continue;
      const value = Number(block.getFieldValue(name));
      if (Number.isFinite(value)) fields[name] = value;
    }
  }

  return fields;
}
