'use client';

import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import * as Ru from 'blockly/msg/ru';
import { BLOCK_DEFINITIONS, TOOLBOX, toAst, type TeachFields } from '@prompower/blocks';
import type { Program } from '@prompower/sim-core';
import {
  EDITOR_GRID,
  EDITOR_THEME,
  NARROW_CLASS,
  NARROW_WIDTH,
  registerSkin,
} from './blockly-skin';
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

/** Определения блоков и стили глобальны для Blockly: регистрируем ровно раз. */
function registerOnce(): void {
  if (registered) return;
  // Расширение обязано быть известно раньше блоков, которые на него ссылаются.
  registerTeachExtension();
  // Стили — до первой инъекции: позже Blockly свой лист уже собрал.
  registerSkin();
  Blockly.defineBlocksWithJsonArray([...BLOCK_DEFINITIONS] as never[]);
  registered = true;
}

/** Отступ программы от края холста, чтобы верхний блок не срезало. */
const PROGRAM_MARGIN = 24;

/** Пауза перед записью черновика: на каждое перетаскивание писать незачем. */
const DRAFT_DELAY_MS = 400;

const SEVERAL_STACKS =
  'На холсте несколько отдельных цепочек блоков. Соедините их в одну программу ' +
  'или уберите лишние: робот выполняет одну цепочку.';

/**
 * Просьба показать роботу точку: что за блок, что в нём записано и куда вернуть
 * показанное.
 *
 * Ответ едет обратно тем же путём, что и просьба, — замыканием на рабочую
 * область. Второго канала до редактора заводить не пришлось.
 */
export interface TeachRequest {
  readonly blockType: string;
  readonly fields: TeachFields;
  /** Записать поля в тот же блок. Меняет программу так же, как ввод руками. */
  write(fields: TeachFields): void;
}

export function BlockEditor({
  initial,
  draftKey,
  onChange,
  onTeach,
}: {
  /** Стартовое содержимое холста в формате сериализации Blockly. */
  initial?: object;
  /**
   * Ключ черновика в браузере. Есть — несохранённая программа переживает уход
   * со страницы (это единственное, что CLAUDE.md разрешает держать локально).
   */
  draftKey?: string;
  onChange: (program: Program, error: string | null) => void;
  onTeach: (request: TeachRequest) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const teach = useRef(onTeach);
  teach.current = onTeach;

  useEffect(() => {
    const container = host.current;
    if (container === null) return;

    registerOnce();
    Blockly.setLocale(Ru as unknown as Record<string, string>);

    const workspace = Blockly.inject(container, {
      toolbox: TOOLBOX,
      renderer: 'zelos',
      theme: EDITOR_THEME,
      grid: EDITOR_GRID,
      zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.4, maxScale: 1.6 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
    });

    // Панель показа живёт дольше одного нажатия, а холст может исчезнуть раньше:
    // блок ищем в момент записи и молчим, если рабочей области уже нет.
    let disposed = false;

    const onTeachEvent = (event: Event): void => {
      const { blockId } = (event as CustomEvent<TeachEventDetail>).detail;
      const block = workspace.getBlockById(blockId);
      if (block === null) return;

      teach.current({
        blockType: block.type,
        fields: numericFields(block),
        write: (fields) => writeFields(disposed ? null : workspace.getBlockById(blockId), fields),
      });
    };
    container.addEventListener(TEACH_EVENT, onTeachEvent);

    nameCategories(workspace);

    const content = readDraft(draftKey) ?? initial;
    if (content !== undefined) {
      if (!tryLoad(workspace, content) && content !== initial && initial !== undefined) {
        // Черновик от прошлой версии блоков не загрузился — лучше стартовая
        // программа, чем пустой холст.
        tryLoad(workspace, initial);
      }
      showFromCorner(workspace);
    }

    const publish = (): void => {
      // Выполняется одна цепочка. Брошенный на холст блок-значение (число,
      // переменная) программой не является и ничего не ломает, а вторая
      // цепочка команд — ломает: раньше молча исполнялась та, что выше, и
      // ученик правил программу, которая не запускалась.
      const stacks = workspace
        .getTopBlocks(true)
        .filter((block) => block.outputConnection === null && block.isEnabled());

      if (stacks.length > 1) {
        latest.current({ version: 1, body: [] }, SEVERAL_STACKS);
        return;
      }

      try {
        latest.current(toAst(stacks[0] ?? null), null);
      } catch (error) {
        latest.current(
          { version: 1, body: [] },
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    let saving = 0;
    const saveDraft = (): void => {
      if (draftKey === undefined) return;
      window.clearTimeout(saving);
      saving = window.setTimeout(() => {
        writeDraft(draftKey, Blockly.serialization.workspaces.save(workspace));
      }, DRAFT_DELAY_MS);
    };

    publish();
    workspace.addChangeListener((event) => {
      // Перерисовки и выделение программу не меняют — на них не реагируем.
      if (event.isUiEvent) return;
      publish();
      saveDraft();
    });

    // Blockly не следит за размером контейнера сам. Заодно решаем, помещаются ли
    // подписи категорий: в узкой зоне палитра с ними съедает половину редактора.
    const observer = new ResizeObserver(() => {
      container.classList.toggle(NARROW_CLASS, container.clientWidth < NARROW_WIDTH);
      Blockly.svgResize(workspace);
    });
    observer.observe(container);

    return () => {
      disposed = true;
      window.clearTimeout(saving);
      observer.disconnect();
      container.removeEventListener(TEACH_EVENT, onTeachEvent);
      workspace.dispose();
    };
  }, [initial, draftKey]);

  return <div ref={host} className="h-full w-full" data-testid="block-editor" />;
}

function tryLoad(workspace: Blockly.WorkspaceSvg, content: object): boolean {
  try {
    Blockly.serialization.workspaces.load(content, workspace);
    return true;
  } catch {
    workspace.clear();
    return false;
  }
}

/**
 * Черновик программы из браузера.
 *
 * Хранилище может быть недоступно (приватный режим, запрет сайта) или хранить
 * мусор — тогда черновика как будто нет, и открывается стартовая программа.
 */
function readDraft(key: string | undefined): object | undefined {
  if (key === undefined) return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeDraft(key: string, content: object): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(content));
  } catch {
    // Нет места или запрещено — черновик просто не переживёт перезагрузку.
  }
}

/** Забыть черновик: следующий холст откроется со стартовой программой. */
export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // См. writeDraft.
  }
}

/**
 * Подсказка с названием категории.
 *
 * В узкой зоне от категории остаётся один значок, и другого способа узнать её
 * название не остаётся. Blockly своей подсказки категориям не ставит.
 */
function nameCategories(workspace: Blockly.WorkspaceSvg): void {
  const toolbox = workspace.getToolbox();
  if (!(toolbox instanceof Blockly.Toolbox)) return;

  for (const item of toolbox.getToolboxItems()) {
    if (item instanceof Blockly.ToolboxCategory) {
      const div = item.getDiv();
      // Подсказка — человеку, атрибут — обучению: по нему подсветка находит
      // категорию, не завися от порядка в палитре.
      div?.setAttribute('title', item.getName());
      div?.setAttribute('data-category', item.getName());
    }
  }
}

/**
 * Показать программу от её левого верхнего угла.
 *
 * Холст открывается без отступа, и верхний блок упирается в край: своего поля
 * у Blockly для этого нет.
 */
function showFromCorner(workspace: Blockly.WorkspaceSvg): void {
  const program = workspace.getBlocksBoundingBox();
  if (program.getWidth() === 0) return;

  workspace.scroll(
    PROGRAM_MARGIN - program.left * workspace.scale,
    PROGRAM_MARGIN - program.top * workspace.scale,
  );
}

/** Запись показанного обратно в блок: имена без поля молча пропускаем. */
function writeFields(block: Blockly.Block | null, fields: TeachFields): void {
  if (block === null) return;

  for (const [name, value] of Object.entries(fields)) {
    if (block.getField(name) === null) continue;
    block.setFieldValue(value, name);
  }
}

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
