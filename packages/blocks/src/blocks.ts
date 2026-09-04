/**
 * Определения блоков редактора.
 *
 * Цвета, порядок категорий и формулировки повторяют JAKA Zu App — человек,
 * учившийся на планшете, должен узнать интерфейс (§5.2 брифа). Факты о планшете
 * собраны в docs/jaka-zu-app-reference.md.
 *
 * Три сознательных отступления от планшета, каждое со своей причиной:
 *
 * 1. Категория «Захват». В JAKA её нет, захват там висит на выходе банка
 *    инструмента. Но §5.2 брифа требует такую категорию, а для школьника
 *    «Закрыть захват» понятнее, чем «Set DO Tool DO1 On». Цвет у неё общий с
 *    вводом-выводом — намёк на то, чем она является на самом деле. В Python
 *    блок разворачивается в честный вызов выхода.
 *
 * 2. Скорость. У блоков движения в JAKA параметров скорости нет: она задаётся
 *    отдельным блоком и общим процентом в панели. Здесь так же — «Скорость»
 *    действует на все последующие движения.
 *
 * 3. Точку показывают роботу. Как и на планшете, поза не набирается числами:
 *    кнопка в блоке поднимает серую копию робота, её доводят ползунками до
 *    нужного места и сохраняют. Числа в полях остаются видимыми и правятся
 *    руками — это тот же источник истины, просто заполняется он показом.
 */

/** Цвета категорий с планшета JAKA. */
export const COLORS = {
  move: '#4a90e2',
  io: '#f2622e',
  control: '#f5a623',
  calculate: '#4caf50',
  variable: '#1f8a4c',
} as const;

export const BLOCK_TYPES = {
  moveJoint: 'pp_move_joint',
  moveLinear: 'pp_move_linear',
  setSpeed: 'pp_set_speed',
  gripper: 'pp_gripper',
  setOutput: 'pp_set_output',
  waitInput: 'pp_wait_input',
  inputIs: 'pp_input_is',
  wait: 'pp_wait',
  repeat: 'pp_repeat',
  branch: 'pp_if',
  comment: 'pp_comment',
} as const;

/**
 * Расширение Blockly, которое вешает на блок кнопку показа точки.
 *
 * Здесь только имя: сам обработчик живёт в слое приложения, потому что ему
 * нужны Blockly и сцена, а этот пакет остаётся данными без импортов.
 */
export const TEACH_EXTENSION = 'pp_teach';

/** Подпись кнопки. Русская, как и весь текст блоков. */
export const TEACH_LABEL = 'показать роботу';

/**
 * Поля позы у блоков движения, по порядку осей и координат.
 *
 * Списки читают и генератор AST, и показ точки: имена полей — контракт блока, и
 * жить он должен там же, где объявлены сами поля.
 */
export const MOVE_JOINT_FIELDS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;
export const MOVE_LINEAR_FIELDS = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'] as const;

const BANK_OPTIONS = [
  ['шкафа', 'cabinet'],
  ['инструмента', 'tool'],
];

const STATE_OPTIONS = [
  ['включён', 'on'],
  ['выключен', 'off'],
];

/**
 * Определения в формате Blockly.
 *
 * Углы показаны в градусах, расстояния в миллиметрах — как на планшете. Перевод
 * в радианы и метры делает генератор AST, ядро о градусах не знает.
 */
export const BLOCK_DEFINITIONS: readonly object[] = [
  {
    type: BLOCK_TYPES.moveJoint,
    message0: 'двигаться по осям %1 %2 %3 %4 %5 %6 %7',
    args0: [
      { type: 'field_number', name: 'J1', value: 0, precision: 0.1 },
      { type: 'field_number', name: 'J2', value: 0, precision: 0.1 },
      { type: 'field_number', name: 'J3', value: 0, precision: 0.1 },
      { type: 'field_number', name: 'J4', value: 0, precision: 0.1 },
      { type: 'field_number', name: 'J5', value: 0, precision: 0.1 },
      { type: 'field_number', name: 'J6', value: 0, precision: 0.1 },
      { type: 'input_dummy' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.move,
    extensions: [TEACH_EXTENSION],
    tooltip: 'Каждая ось приходит в заданный угол. Траектория фланца произвольная.',
  },
  {
    type: BLOCK_TYPES.moveLinear,
    message0: 'двигаться по прямой в X %1 Y %2 Z %3 мм %4',
    args0: [
      { type: 'field_number', name: 'X', value: 350, precision: 1 },
      { type: 'field_number', name: 'Y', value: 0, precision: 1 },
      { type: 'field_number', name: 'Z', value: 200, precision: 1 },
      { type: 'input_dummy' },
    ],
    message1: 'поворот RX %1 RY %2 RZ %3 °',
    args1: [
      { type: 'field_number', name: 'RX', value: 180, precision: 0.1 },
      { type: 'field_number', name: 'RY', value: 0, precision: 0.1 },
      { type: 'field_number', name: 'RZ', value: 0, precision: 0.1 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.move,
    extensions: [TEACH_EXTENSION],
    tooltip: 'Фланец идёт в точку по отрезку в показанной ориентации.',
  },
  {
    type: BLOCK_TYPES.setSpeed,
    message0: 'скорость %1 %%',
    args0: [{ type: 'field_number', name: 'PERCENT', value: 50, min: 1, max: 100, precision: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.move,
    tooltip: 'Действует на все движения ниже, как общая скорость на планшете.',
  },
  {
    type: BLOCK_TYPES.gripper,
    message0: '%1 захват',
    args0: [
      {
        type: 'field_dropdown',
        name: 'ACTION',
        options: [
          ['закрыть', 'close'],
          ['открыть', 'open'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.io,
    tooltip: 'На роботе захват подключён к выходу инструмента.',
  },
  {
    type: BLOCK_TYPES.setOutput,
    message0: 'выход %1 DO %2 %3',
    args0: [
      { type: 'field_dropdown', name: 'BANK', options: BANK_OPTIONS },
      { type: 'field_number', name: 'INDEX', value: 1, min: 1, precision: 1 },
      { type: 'field_dropdown', name: 'STATE', options: STATE_OPTIONS },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.io,
    tooltip: 'Каналы нумеруются с единицы, как на экране ввода-вывода.',
  },
  {
    type: BLOCK_TYPES.waitInput,
    message0: 'ждать вход %1 DI %2 %3',
    args0: [
      { type: 'field_dropdown', name: 'BANK', options: BANK_OPTIONS },
      { type: 'field_number', name: 'INDEX', value: 1, min: 1, precision: 1 },
      { type: 'field_dropdown', name: 'STATE', options: STATE_OPTIONS },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.io,
    tooltip: 'Программа стоит, пока на входе не появится нужное состояние.',
  },
  {
    type: BLOCK_TYPES.inputIs,
    message0: 'вход %1 DI %2 %3',
    args0: [
      { type: 'field_dropdown', name: 'BANK', options: BANK_OPTIONS },
      { type: 'field_number', name: 'INDEX', value: 1, min: 1, precision: 1 },
      { type: 'field_dropdown', name: 'STATE', options: STATE_OPTIONS },
    ],
    output: 'Boolean',
    colour: COLORS.io,
    tooltip: 'Условие: подходит для блока «если».',
  },
  {
    type: BLOCK_TYPES.wait,
    message0: 'ждать %1 с',
    args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0, precision: 0.1 }],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.control,
  },
  {
    type: BLOCK_TYPES.repeat,
    message0: 'повторить %1 раз %2 %3',
    args0: [
      { type: 'field_number', name: 'TIMES', value: 3, min: 0, precision: 1 },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'BODY' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.control,
  },
  {
    type: BLOCK_TYPES.branch,
    message0: 'если %1 то %2',
    args0: [
      { type: 'input_value', name: 'COND', check: 'Boolean' },
      { type: 'input_statement', name: 'THEN' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.control,
  },
  {
    type: BLOCK_TYPES.comment,
    message0: 'заметка %1',
    args0: [{ type: 'field_input', name: 'TEXT', text: 'что делаем' }],
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.control,
    tooltip: 'На робота не влияет, нужна человеку.',
  },
];

/** Тулбокс: порядок и названия категорий с планшета. */
export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Движение',
      colour: COLORS.move,
      contents: [
        { kind: 'block', type: BLOCK_TYPES.moveJoint },
        { kind: 'block', type: BLOCK_TYPES.moveLinear },
        { kind: 'block', type: BLOCK_TYPES.setSpeed },
      ],
    },
    {
      kind: 'category',
      name: 'Захват',
      colour: COLORS.io,
      contents: [{ kind: 'block', type: BLOCK_TYPES.gripper }],
    },
    {
      kind: 'category',
      name: 'Входы и выходы',
      colour: COLORS.io,
      contents: [
        { kind: 'block', type: BLOCK_TYPES.setOutput },
        { kind: 'block', type: BLOCK_TYPES.waitInput },
        { kind: 'block', type: BLOCK_TYPES.inputIs },
      ],
    },
    {
      kind: 'category',
      name: 'Управление',
      colour: COLORS.control,
      contents: [
        { kind: 'block', type: BLOCK_TYPES.wait },
        { kind: 'block', type: BLOCK_TYPES.repeat },
        { kind: 'block', type: BLOCK_TYPES.branch },
        { kind: 'block', type: BLOCK_TYPES.comment },
      ],
    },
  ],
};
