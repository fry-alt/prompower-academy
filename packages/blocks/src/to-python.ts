import type {
  Condition,
  Expression,
  IoBank,
  Program,
  Statement,
  Value,
} from '@prompower/sim-core';

/**
 * Генерация скрипта на Python под JAKA SDK.
 *
 * Скрипт делается из AST, а не из дерева блоков напрямую. Бриф в §5.2 говорит о
 * двух генераторах из одного дерева; здесь второй генератор берёт не блоки, а
 * уже разобранный AST. Причина простая: так текст и симуляция не могут разойтись
 * — обе стороны читают одно и то же. Заодно генератор становится чистой
 * функцией и проверяется без Blockly и без браузера.
 *
 * ВНИМАНИЕ. Имена методов и порядок аргументов взяты по документации JAKA SDK
 * (модуль `jkrc`) и НЕ проверены на живом контроллере. Всё, что зависит от
 * версии SDK, собрано в таблице `API` ниже — это единственное место, которое
 * нужно поправить, если у заказчика другая ревизия.
 */

/** Соответствие наших операций вызовам SDK. Одно место для правки под ревизию. */
const API = {
  module: 'jkrc',
  connect: 'RC',
  login: 'login',
  powerOn: 'power_on',
  enable: 'enable_robot',
  disable: 'disable_robot',
  logout: 'logout',
  jointMove: 'joint_move',
  linearMove: 'linear_move',
  setDigitalOutput: 'set_digital_output',
  getDigitalInput: 'get_digital_input',
  /** Режим движения: абсолютные координаты. */
  absoluteMode: 'ABS',
  /** Ждать завершения движения, а не возвращаться сразу. */
  blocking: 'TRUE',
  /** Тип канала: шкаф управления и инструмент. */
  ioCabinet: 'IO_CABINET',
  ioTool: 'IO_TOOL',
} as const;

export interface PythonOptions {
  /** Адрес контроллера. Подставляется в шапку скрипта. */
  readonly host?: string;
  /** Выход инструмента, на котором висит захват. */
  readonly gripperOutput?: number;
  /** Паспортная скорость суставов, рад/с: доля из программы умножается на неё. */
  readonly maxJointSpeed?: number;
  /** Паспортная скорость фланца, мм/с. */
  readonly maxLinearSpeed?: number;
}

interface Settings {
  readonly host: string;
  readonly gripperOutput: number;
  readonly maxJointSpeed: number;
  readonly maxLinearSpeed: number;
}

const DEFAULTS: Settings = {
  host: '192.168.1.100',
  gripperOutput: 1,
  maxJointSpeed: 3.14,
  maxLinearSpeed: 250,
};

const MM = 1000;

export function toPython(program: Program, options: PythonOptions = {}): string {
  const settings: Settings = { ...DEFAULTS, ...options };
  const body = program.body.flatMap((statement) => emit(statement, settings, 1));

  return [
    ...header(settings, usesTime(program.body)),
    ...(body.length > 0 ? body : [`${indent(1)}pass`]),
    ...footer(),
  ].join('\n');
}

function header(settings: Settings, needsTime: boolean): string[] {
  return [
    '# Программа собрана в PROMPOWER Academy.',
    '# Перед запуском на роботе проверьте адрес контроллера и номера каналов.',
    '',
    `import ${API.module}`,
    // `time` подключается только когда в программе есть ожидание: лишний импорт
    // в коротком скрипте сбивает с толку.
    ...(needsTime ? ['import time'] : []),
    '',
    `robot = ${API.module}.${API.connect}("${settings.host}")`,
    'try:',
    `${indent(1)}robot.${API.login}()`,
    `${indent(1)}robot.${API.powerOn}()`,
    `${indent(1)}robot.${API.enable}()`,
    '',
  ];
}

function footer(): string[] {
  return [
    '',
    'finally:',
    `${indent(1)}robot.${API.disable}()`,
    `${indent(1)}robot.${API.logout}()`,
  ];
}

function emit(statement: Statement, settings: Settings, depth: number): string[] {
  const pad = indent(depth);

  switch (statement.op) {
    case 'comment':
      return [`${pad}# ${statement.text}`];

    case 'moveJ': {
      const joints = statement.joints.map((value) => value.toFixed(6)).join(', ');
      const speed = (statement.speed * settings.maxJointSpeed).toFixed(3);
      return [
        `${pad}# Движение по осям, углы в радианах`,
        `${pad}robot.${API.jointMove}([${joints}], ${API.absoluteMode}, ${API.blocking}, ${speed})`,
      ];
    }

    case 'moveL': {
      const { pose } = statement;
      // SDK принимает положение в миллиметрах, ориентацию — в радианах.
      const target = [
        millimetres(pose.x),
        millimetres(pose.y),
        millimetres(pose.z),
        radians(pose.rx),
        radians(pose.ry),
        radians(pose.rz),
      ].join(', ');
      const speed = (statement.speed * settings.maxLinearSpeed).toFixed(1);
      return [
        `${pad}# Движение по прямой, положение в миллиметрах`,
        `${pad}robot.${API.linearMove}([${target}], ${API.absoluteMode}, ${API.blocking}, ${speed})`,
      ];
    }

    case 'setDO':
      return [
        `${pad}robot.${API.setDigitalOutput}(${bank(statement.bank)}, ${statement.index}, ${bool(statement.value)})`,
      ];

    case 'gripper': {
      // В JAKA Zu App отдельного блока захвата нет: он висит на выходе
      // инструмента. Дружелюбный блок в редакторе разворачивается сюда.
      const closed = statement.action === 'close';
      return [
        `${pad}# ${closed ? 'Закрыть' : 'Открыть'} захват`,
        `${pad}robot.${API.setDigitalOutput}(${API.ioTool}, ${settings.gripperOutput}, ${bool(closed)})`,
      ];
    }

    case 'waitDI': {
      const timeout = statement.timeoutMs === undefined ? '' : `, ${statement.timeoutMs / 1000}`;
      return [
        `${pad}while robot.${API.getDigitalInput}(${bank(statement.bank)}, ${statement.index})[1] != ${bool(statement.value)}:`,
        `${indent(depth + 1)}time.sleep(0.01)${timeout === '' ? '' : `  # таймаут${timeout} с`}`,
      ];
    }

    case 'wait':
      return [`${pad}time.sleep(${statement.ms / 1000})`];

    case 'repeat':
      return [
        `${pad}for _ in range(${statement.times}):`,
        ...block(statement.body, settings, depth + 1),
      ];

    case 'while':
      return [
        `${pad}while ${condition(statement.cond, settings)}:`,
        ...block(statement.body, settings, depth + 1),
      ];

    case 'if': {
      const lines = [
        `${pad}if ${condition(statement.cond, settings)}:`,
        ...block(statement.then, settings, depth + 1),
      ];
      if (statement.else !== undefined && statement.else.length > 0) {
        lines.push(`${pad}else:`, ...block(statement.else, settings, depth + 1));
      }
      return lines;
    }

    case 'setVar':
      return [`${pad}${identifier(statement.name)} = ${expression(statement.value)}`];
  }
}

/** Есть ли в программе ожидание: от этого зависит, нужен ли `import time`. */
function usesTime(body: readonly Statement[]): boolean {
  return body.some((statement) => {
    if (statement.op === 'wait' || statement.op === 'waitDI') return true;
    if (statement.op === 'repeat' || statement.op === 'while') return usesTime(statement.body);
    if (statement.op === 'if') {
      return usesTime(statement.then) || usesTime(statement.else ?? []);
    }
    return false;
  });
}

/** Тело блока. Пустое тело в Python недопустимо, поэтому там появляется `pass`. */
function block(body: readonly Statement[], settings: Settings, depth: number): string[] {
  const lines = body.flatMap((statement) => emit(statement, settings, depth));
  return lines.length > 0 ? lines : [`${indent(depth)}pass`];
}

function condition(cond: Condition, settings: Settings): string {
  switch (cond.kind) {
    case 'compare':
      return `${expression(cond.left)} ${cond.operator} ${expression(cond.right)}`;
    case 'digitalInput':
      return `robot.${API.getDigitalInput}(${bank(cond.bank)}, ${cond.index})[1] == ${bool(cond.value)}`;
    case 'not':
      return `not (${condition(cond.operand, settings)})`;
    case 'and':
      return `(${condition(cond.left, settings)}) and (${condition(cond.right, settings)})`;
    case 'or':
      return `(${condition(cond.left, settings)}) or (${condition(cond.right, settings)})`;
  }
}

/**
 * Координата в миллиметрах.
 *
 * Выражение из редактора приходит делённым на тысячу — ядро хранит метры.
 * Умножать его обратно значило бы печатать `(y / 1000) * 1000`, поэтому деление
 * сокращается: в файле стоит то, что собрал ученик, и сразу в миллиметрах.
 */
function millimetres(value: Value): string {
  if (typeof value === 'number') return (value * MM).toFixed(3);

  if (
    value.kind === 'binary' &&
    value.operator === '/' &&
    value.right.kind === 'number' &&
    value.right.value === MM
  ) {
    return expression(value.left);
  }

  return `(${expression(value)}) * ${MM}`;
}

/** Углы уже в радианах: переводить нечего, но выражение печатается как есть. */
function radians(value: Value): string {
  return typeof value === 'number' ? value.toFixed(6) : expression(value);
}

function expression(value: Expression): string {
  switch (value.kind) {
    case 'number':
      return String(value.value);
    case 'variable':
      return identifier(value.name);
    case 'binary':
      return `(${expression(value.left)} ${value.operator} ${expression(value.right)})`;
  }
}

/**
 * Имя переменной для Python.
 *
 * В редакторе имена русские, а Python до версии 3 таких идентификаторов не
 * принимает; в третьей принимает, но читать такой скрипт инженеру неудобно.
 * Поэтому кириллица переводится в латиницу, а всё прочее — в подчёркивания.
 */
function identifier(name: string): string {
  const latin = [...name.toLowerCase()]
    .map((char) => TRANSLIT[char] ?? char)
    .join('')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return latin === '' || /^\d/.test(latin) ? `var_${latin}` : latin;
}

const TRANSLIT: Readonly<Record<string, string>> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

function bank(value: IoBank): string {
  return value === 'cabinet' ? API.ioCabinet : API.ioTool;
}

function bool(value: boolean): string {
  return value ? '1' : '0';
}

function indent(depth: number): string {
  return '    '.repeat(depth);
}
