'use client';

import * as Blockly from 'blockly';
import { COLORS } from '@prompower/blocks';

/**
 * Внешний вид редактора блоков.
 *
 * Blockly приносит своё оформление: светлую палитру категорий, свой шрифт и
 * бледные полосы прокрутки. Здесь оно приводится к палитре приложения. Тема
 * отвечает за то, что Blockly рисует сам — холст, флайаут, курсор, — а CSS за
 * палитру категорий и служебные кнопки, до которых тема не достаёт.
 *
 * Цвета продублированы шестнадцатеричными значениями токенов `globals.css`:
 * тему разбирает собственный парсер Blockly, `var(--color-…)` он не поймёт.
 * Меняются вместе с токенами.
 */

const SURFACE_0 = '#0b0d10';
const SURFACE_1 = '#141619';
const SURFACE_2 = '#1f2225';
const LINE = '#303337';
const INK = '#eaebed';
const INK_DIM = '#a1a5a9';
const INK_FAINT = '#717579';
const BRAND = '#f3821d';
/** Сетка холста: заметна вблизи, не спорит с блоками издали. */
const GRID = '#191c20';

const SANS = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

/** Уже этой ширины подписи категорий уходят, палитра остаётся столбиком значков. */
export const NARROW_WIDTH = 420;
export const NARROW_CLASS = 'ppNarrowPalette';

export const EDITOR_GRID = { spacing: 24, length: 3, colour: GRID, snap: true };

export const EDITOR_THEME = Blockly.Theme.defineTheme('prompower', {
  name: 'prompower',
  base: Blockly.Themes.Classic,
  // Тот же шрифт, что и в интерфейсе: подписи на блоках — часть одного экрана.
  fontStyle: { family: SANS },
  componentStyles: {
    workspaceBackgroundColour: SURFACE_0,
    toolboxBackgroundColour: SURFACE_1,
    toolboxForegroundColour: INK_DIM,
    flyoutBackgroundColour: SURFACE_1,
    flyoutForegroundColour: INK_DIM,
    flyoutOpacity: 1,
    scrollbarColour: LINE,
    insertionMarkerColour: BRAND,
    insertionMarkerOpacity: 0.5,
    cursorColour: BRAND,
  },
});

/**
 * Значки категорий.
 *
 * Классы назначены категориям в `packages/blocks/src/blocks.ts`: Blockly берёт
 * их из `cssconfig` и подменяет ими свой собственный класс значка. Цвет — тот
 * же, что у блоков категории, поэтому значок в палитре и блок на холсте
 * читаются как одно.
 */
const CATEGORY_ICONS = [
  {
    css: 'ppIconMove',
    colour: COLORS.move,
    path: "<path d='M2.5 12h4.5a3.5 3.5 0 0 0 3.5-3.5V4'/><path d='M8 6.5 10.5 4 13 6.5'/>",
  },
  {
    css: 'ppIconGrip',
    colour: COLORS.io,
    path: "<path d='M3.5 2.5v11'/><path d='M12.5 2.5v11'/><rect x='6' y='5.5' width='4' height='5' rx='1'/>",
  },
  {
    css: 'ppIconIo',
    colour: COLORS.io,
    path: "<path d='M2.5 5H9'/><path d='M7 3 9 5 7 7'/><path d='M13.5 11H7'/><path d='M9 9 7 11 9 13'/>",
  },
  {
    css: 'ppIconControl',
    colour: COLORS.control,
    path:
      "<path d='M4.5 6.5V6A2.5 2.5 0 0 1 7 3.5h4.5'/><path d='M9.5 1.5 11.5 3.5 9.5 5.5'/>" +
      "<path d='M11.5 9.5v.5a2.5 2.5 0 0 1-2.5 2.5H4.5'/><path d='M6.5 10.5 4.5 12.5 6.5 14.5'/>",
  },
] as const;

/** Значок ходит маской, а не картинкой: так он красится цветом категории. */
function mask(path: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="black" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const ICON_SELECTOR = CATEGORY_ICONS.map(({ css }) => `.${css}`).join(',\n');

const ICON_COLOURS = CATEGORY_ICONS.map(({ css, colour, path }) => {
  const image = mask(path);
  return `
.${css} {
  background-color: ${colour};
  -webkit-mask-image: ${image};
  mask-image: ${image};
}`;
}).join('');

const SKIN_CSS = `
/* Палитра категорий: панель приложения вместо серого списка Blockly. */
.blocklyToolbox {
  background-color: ${SURFACE_1};
  border-right: 1px solid ${LINE};
  padding: 8px;
}

.blocklyToolboxCategory {
  /* Цвет категории Blockly вешает полосой слева прямо в стиль элемента, а у нас
     он живёт в значке. Inline-стиль перебивается только !important. */
  border-left-width: 0 !important;
  border-radius: 6px;
  color: ${INK_DIM};
  height: auto;
  line-height: 1.25;
  margin-bottom: 2px;
  padding: 7px 10px;
  transition: background-color 120ms ease, color 120ms ease;
}

.blocklyTreeRowContentContainer {
  align-items: center;
  display: flex;
  gap: 8px;
}

.blocklyToolboxCategoryLabel {
  color: inherit;
  font: 500 13px/1.25 ${SANS};
  padding: 0;
}

.blocklyToolboxCategory:not(.blocklyToolboxSelected):hover {
  background-color: ${SURFACE_2};
  color: ${INK};
}

/* Выбранную категорию Blockly заливает её же цветом — тоже inline-стилем. */
.blocklyToolboxSelected {
  background-color: ${SURFACE_2} !important;
  color: ${INK};
}

.blocklyToolboxSelected .blocklyToolboxCategoryLabel {
  color: ${INK};
}

${ICON_SELECTOR} {
  display: block;
  flex: none;
  height: 15px;
  width: 15px;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  mask-size: contain;
}
${ICON_COLOURS}

/* Узкая зона: подписи уходят, палитра остаётся столбиком значков. */
.${NARROW_CLASS} .blocklyToolboxCategoryLabel {
  display: none;
}

.${NARROW_CLASS} .blocklyToolboxCategory {
  padding: 8px;
}

/* Холст: рамка Blockly светлая и на тёмном фоне читается как шов. */
.blocklyMainBackground {
  stroke: none;
}

.blocklyFlyoutBackground {
  stroke: ${LINE};
  stroke-width: 1px;
}

/* Полосы прокрутки. Тема их красит, но своё правило Blockly для флайаута
   специфичнее, и поверх холста остаётся светлая полоса. */
.blocklyScrollbarHandle,
.blocklyFlyout .blocklyScrollbarHandle {
  fill: ${LINE};
}

.blocklyScrollbarHandle:hover,
.blocklyScrollbarBackground:hover + .blocklyScrollbarHandle,
.blocklyFlyout .blocklyScrollbarHandle:hover {
  fill: ${INK_FAINT};
}

/* Кнопки масштаба и корзина — служебные, в глаза не лезут. */
.blocklyZoom > image,
.blocklyZoom > svg > image {
  opacity: 0.25;
}

.blocklyZoom > image:hover,
.blocklyZoom > svg > image:hover {
  opacity: 0.5;
}

.blocklyTrash {
  opacity: 0.3;
  transition: opacity 120ms ease;
}

.blocklyTrash:hover {
  opacity: 0.55;
}
`;

let registered = false;

/**
 * Blockly собирает свой лист стилей один раз, при первой инъекции: правки,
 * поданные позже, до страницы не доедут.
 */
export function registerSkin(): void {
  if (registered) return;
  Blockly.Css.register(SKIN_CSS);
  registered = true;
}
