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
 * Скрипт самодостаточен: константы SDK (`ABS`, `IO_CABINET`, `IO_TOOL`) в
 * модуле `jkrc` не объявлены — в примерах JAKA их заводят в самом скрипте, и
 * без них программа упала бы на первой же строке с `NameError`.
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
  /** Режим движения: абсолютные координаты. Значение — в шапке скрипта. */
  absoluteMode: 'ABS',
  /** Ждать завершения движения, а не возвращаться сразу. */
  blocking: 'True',
  /** Тип канала: шкаф управления и инструмент. Значения — в шапке скрипта. */
  ioCabinet: 'IO_CABINET',
  ioTool: 'IO_TOOL',
} as const;

export interface PythonOptions {
  /** Адрес контроллера. Подставляется в шапку скрипта. */
  readonly host?: string;
  /** Выход инструмента, на котором висит захват. */
  readonly gripperOutput?: number;
  /**
   * Скорость суставов при доле 1, рад/с: доля из программы умножается на неё.
   * Берётся из URDF модели — экран урока передаёт её сюда сам.
   */
  readonly maxJointSpeed?: number;
  /** Скорость фланца при доле 1, мм/с. Настройка контроллера, не робота. */
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

/** Что генератору надо знать о программе целиком, до печати первой строки. */
interface Usage {
  time: boolean;
  inputs: boolean;
  division: boolean;
  /** Имена переменных в порядке первого появления. */
  readonly variables: string[];
}

interface Context {
  readonly settings: Settings;
  /** Имя переменной в редакторе → идентификатор в Python. */
  readonly names: ReadonlyMap<string, string>;
}

export function toPython(program: Program, options: PythonOptions = {}): string {
  const settings: Settings = { ...DEFAULTS, ...options };
  const usage = survey(program.body);
  const context: Context = { settings, names: identifiers(usage.variables) };
  const body = program.body.flatMap((statement) => emit(statement, context, 1));

  return [
    ...header(settings, usage, context),
    ...(body.length > 0 ? body : [`${indent(1)}pass`]),
    ...footer(),
  ].join('\n');
}

function header(settings: Settings, usage: Usage, context: Context): string[] {
  const helpers = [
    'def _check(result, action):',
    '    # Первый элемент ответа SDK — код ошибки, ноль значит успех. Ошибку не',
    '    # глотаем: робот, не доехавший до точки, не должен продолжать программу.',
    '    if result[0] != 0:',
    '        raise RuntimeError(action + ": контроллер вернул код " + str(result[0]))',
    '    return result',
    ...(usage.inputs
      ? [
          '',
          '',
          'def _input(iotype, index):',
          `    return _check(robot.${API.getDigitalInput}(iotype, index), "чтение входа")[1]`,
        ]
      : []),
    ...(usage.division
      ? [
          '',
          '',
          'def _div(a, b):',
          '    # Как в симуляторе: деление на ноль даёт ноль, а не остановку программы.',
          '    return a / b if b != 0 else 0',
        ]
      : []),
  ];

  // Переменные заводятся нулём заранее: в симуляторе необъявленная переменная
  // равна нулю, а Python на ней остановился бы с NameError.
  const variables = usage.variables.map((name) => `${indent(1)}${context.names.get(name)} = 0`);

  return [
    '# Программа собрана в PROMPOWER Academy.',
    '# Перед запуском на роботе проверьте адрес контроллера и номера каналов.',
    '',
    `import ${API.module}`,
    // `time` подключается только когда в программе есть ожидание: лишний импорт
    // в коротком скрипте сбивает с толку.
    ...(usage.time ? ['import time'] : []),
    '',
    '# Константы SDK: режим движения и типы каналов ввода-вывода.',
    `${API.absoluteMode} = 0`,
    `${API.ioCabinet} = 0`,
    `${API.ioTool} = 1`,
    '',
    '',
    ...helpers,
    '',
    '',
    `robot = ${API.module}.${API.connect}("${settings.host}")`,
    'try:',
    `${indent(1)}_check(robot.${API.login}(), "вход в контроллер")`,
    `${indent(1)}_check(robot.${API.powerOn}(), "включение питания")`,
    `${indent(1)}_check(robot.${API.enable}(), "включение робота")`,
    ...variables,
    '',
  ];
}

function footer(): string[] {
  return [
    '',
    'finally:',
    `${indent(1)}robot.${API.disable}()`,
    `${indent(1)}robot.${API.logout}()`,
    '',
  ];
}

function emit(statement: Statement, context: Context, depth: number): string[] {
  const pad = indent(depth);
  const { settings } = context;

  switch (statement.op) {
    case 'comment':
      // Перенос строки в комментарии превратил бы его хвост в код.
      return [`${pad}# ${statement.text.replace(/[\r\n]+/g, ' ')}`];

    case 'moveJ': {
      const joints = statement.joints.map((value) => value.toFixed(6)).join(', ');
      const speed = (statement.speed * settings.maxJointSpeed).toFixed(3);
      return [
        `${pad}# Движение по осям, углы в радианах`,
        `${pad}_check(robot.${API.jointMove}([${joints}], ${API.absoluteMode}, ${API.blocking}, ${speed}), "движение по осям")`,
      ];
    }

    case 'moveL': {
      const { pose } = statement;
      // SDK принимает положение в миллиметрах, ориентацию — в радианах.
      const target = [
        millimetres(pose.x, context),
        millimetres(pose.y, context),
        millimetres(pose.z, context),
        radians(pose.rx, context),
        radians(pose.ry, context),
        radians(pose.rz, context),
      ].join(', ');
      const speed = (statement.speed * settings.maxLinearSpeed).toFixed(1);
      return [
        `${pad}# Движение по прямой, положение в миллиметрах`,
        `${pad}_check(robot.${API.linearMove}([${target}], ${API.absoluteMode}, ${API.blocking}, ${speed}), "движение по прямой")`,
      ];
    }

    case 'setDO':
      return [
        `${pad}_check(robot.${API.setDigitalOutput}(${bank(statement.bank)}, ${statement.index}, ${bool(statement.value)}), "выход")`,
      ];

    case 'gripper': {
      // В JAKA Zu App отдельного блока захвата нет: он висит на выходе
      // инструмента. Дружелюбный блок в редакторе разворачивается сюда.
      const closed = statement.action === 'close';
      return [
        `${pad}# ${closed ? 'Закрыть' : 'Открыть'} захват`,
        `${pad}_check(robot.${API.setDigitalOutput}(${API.ioTool}, ${settings.gripperOutput}, ${bool(closed)}), "захват")`,
      ];
    }

    case 'waitDI': {
      const waiting = `_input(${bank(statement.bank)}, ${statement.index}) != ${bool(statement.value)}`;
      const inner = indent(depth + 1);

      if (statement.timeoutMs === undefined) {
        return [`${pad}while ${waiting}:`, `${inner}time.sleep(0.01)`];
      }

      // Таймаут исполняется, а не остаётся комментарием: в симуляторе он
      // останавливает программу, и на роботе обязан делать то же самое.
      return [
        `${pad}_deadline = time.monotonic() + ${statement.timeoutMs / 1000}`,
        `${pad}while ${waiting}:`,
        `${inner}if time.monotonic() >= _deadline:`,
        `${indent(depth + 2)}raise TimeoutError("Сигнал на входе ${statement.index} не появился за ${statement.timeoutMs} мс")`,
        `${inner}time.sleep(0.01)`,
      ];
    }

    case 'wait':
      return [`${pad}time.sleep(${statement.ms / 1000})`];

    case 'repeat':
      return [
        `${pad}for _ in range(${statement.times}):`,
        ...block(statement.body, context, depth + 1),
      ];

    case 'while':
      return [
        `${pad}while ${condition(statement.cond, context)}:`,
        ...block(statement.body, context, depth + 1),
      ];

    case 'if': {
      const lines = [
        `${pad}if ${condition(statement.cond, context)}:`,
        ...block(statement.then, context, depth + 1),
      ];
      if (statement.else !== undefined && statement.else.length > 0) {
        lines.push(`${pad}else:`, ...block(statement.else, context, depth + 1));
      }
      return lines;
    }

    case 'setVar':
      return [`${pad}${name(statement.name, context)} = ${expression(statement.value, context)}`];
  }
}

/** Один проход по дереву: какие импорты, помощники и переменные понадобятся. */
function survey(body: readonly Statement[]): Usage {
  const usage: Usage = { time: false, inputs: false, division: false, variables: [] };

  const variable = (name: string): void => {
    if (!usage.variables.includes(name)) usage.variables.push(name);
  };

  const walkExpression = (value: Value): void => {
    if (typeof value === 'number') return;
    if (value.kind === 'variable') variable(value.name);
    if (value.kind === 'binary') {
      if (value.operator === '/' && !isMillimetreScale(value)) usage.division = true;
      walkExpression(value.left);
      walkExpression(value.right);
    }
  };

  const walkCondition = (cond: Condition): void => {
    switch (cond.kind) {
      case 'compare':
        walkExpression(cond.left);
        walkExpression(cond.right);
        return;
      case 'digitalInput':
        usage.inputs = true;
        return;
      case 'not':
        walkCondition(cond.operand);
        return;
      case 'and':
      case 'or':
        walkCondition(cond.left);
        walkCondition(cond.right);
    }
  };

  const walk = (statements: readonly Statement[]): void => {
    for (const statement of statements) {
      switch (statement.op) {
        case 'wait':
          usage.time = true;
          break;
        case 'waitDI':
          usage.time = true;
          usage.inputs = true;
          break;
        case 'moveL':
          Object.values(statement.pose).forEach(walkExpression);
          break;
        case 'setVar':
          variable(statement.name);
          walkExpression(statement.value);
          break;
        case 'repeat':
          walk(statement.body);
          break;
        case 'while':
          walkCondition(statement.cond);
          walk(statement.body);
          break;
        case 'if':
          walkCondition(statement.cond);
          walk(statement.then);
          walk(statement.else ?? []);
          break;
        default:
          break;
      }
    }
  };

  walk(body);
  return usage;
}

/** Тело блока. Пустое тело в Python недопустимо, поэтому там появляется `pass`. */
function block(body: readonly Statement[], context: Context, depth: number): string[] {
  const lines = body.flatMap((statement) => emit(statement, context, depth));
  return lines.length > 0 ? lines : [`${indent(depth)}pass`];
}

function condition(cond: Condition, context: Context): string {
  switch (cond.kind) {
    case 'compare':
      return `${expression(cond.left, context)} ${cond.operator} ${expression(cond.right, context)}`;
    case 'digitalInput':
      return `_input(${bank(cond.bank)}, ${cond.index}) == ${bool(cond.value)}`;
    case 'not':
      return `not (${condition(cond.operand, context)})`;
    case 'and':
      return `(${condition(cond.left, context)}) and (${condition(cond.right, context)})`;
    case 'or':
      return `(${condition(cond.left, context)}) or (${condition(cond.right, context)})`;
  }
}

/** Выражение вида `… / 1000`: так редактор переводит миллиметры ученика в метры. */
function isMillimetreScale(value: Expression): value is Extract<Expression, { kind: 'binary' }> {
  return (
    value.kind === 'binary' &&
    value.operator === '/' &&
    value.right.kind === 'number' &&
    value.right.value === MM
  );
}

/**
 * Координата в миллиметрах.
 *
 * Выражение из редактора приходит делённым на тысячу — ядро хранит метры.
 * Умножать его обратно значило бы печатать `(y / 1000) * 1000`, поэтому деление
 * сокращается: в файле стоит то, что собрал ученик, и сразу в миллиметрах.
 */
function millimetres(value: Value, context: Context): string {
  if (typeof value === 'number') return (value * MM).toFixed(3);
  if (isMillimetreScale(value)) return expression(value.left, context);
  return `(${expression(value, context)}) * ${MM}`;
}

/** Углы уже в радианах: переводить нечего, но выражение печатается как есть. */
function radians(value: Value, context: Context): string {
  return typeof value === 'number' ? value.toFixed(6) : expression(value, context);
}

function expression(value: Expression, context: Context): string {
  switch (value.kind) {
    case 'number':
      return String(value.value);
    case 'variable':
      return name(value.name, context);
    case 'binary': {
      const left = expression(value.left, context);
      const right = expression(value.right, context);
      // Деление идёт через помощника: у симулятора деление на ноль даёт ноль.
      return value.operator === '/'
        ? `_div(${left}, ${right})`
        : `(${left} ${value.operator} ${right})`;
    }
  }
}

function name(source: string, context: Context): string {
  return context.names.get(source) ?? identifier(source);
}

/**
 * Идентификаторы Python для всех переменных программы.
 *
 * Разные имена в редакторе не должны слиться в одно после транслитерации
 * («Ряд» и «ряд»), а имя не должно совпасть ни со словом языка, ни с тем, что
 * скрипт использует сам: переменная `robot` или `range` сломала бы программу.
 */
function identifiers(variables: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  const taken = new Set<string>();

  for (const variable of variables) {
    let base = identifier(variable);
    if (RESERVED.has(base)) base = `${base}_var`;

    let candidate = base;
    for (let suffix = 2; taken.has(candidate); suffix += 1) candidate = `${base}_${suffix}`;

    taken.add(candidate);
    result.set(variable, candidate);
  }

  return result;
}

/** Слова Python и имена, которые скрипт занимает сам. Имена уже в нижнем регистре. */
const RESERVED: ReadonlySet<string> = new Set([
  'false', 'none', 'true', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
  'try', 'while', 'with', 'yield', 'match', 'case', 'type',
  'robot', 'time', 'jkrc', 'range', 'print', 'abs', 'min', 'max', 'int', 'float', 'str',
  'len', 'list', 'dict', 'round',
]);

/**
 * Имя переменной для Python.
 *
 * В редакторе имена русские. Python 3 такие идентификаторы принимает, но читать
 * скрипт инженеру неудобно, поэтому кириллица переводится в латиницу, а всё
 * прочее — в подчёркивания.
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
