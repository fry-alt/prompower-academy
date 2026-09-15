# Шестой урок: полный цикл — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Курс заканчивается уроком, где три детали раскладываются по ячейкам паллеты циклом со счётчиком, а место каждой детали считается выражением.

**Architecture:** Координата движения в программе становится `Value` — числом либо выражением; кинематика продолжает работать с числовой позой, а интерпретатор разрешает выражения по переменным перед планированием. В палитру приходят пять блоков (число, переменная, арифметика, «задать переменную», движение с вычисляемыми координатами) и категория «Переменные». Обязательность цикла обеспечивает существующее ограничение `maxStatements`.

**Tech Stack:** TypeScript strict, Vitest (node), Blockly, React 19 + @react-three/fiber, Playwright.

Источник требований: [спека](../specs/2026-09-15-lesson-six-design.md), §7 брифа.

---

## Единицы измерения

Правило проекта: ядро в СИ, блоки в миллиметрах и градусах, перевод — на границе
`to-ast`. Для вычисляемых координат это значит следующее.

- Переменная ученика хранит **миллиметры**: он пишет `y = -100 + i * 100`, и
  число в переменной — то же, что он видит в полях обычного блока движения.
- Разъём координаты **делит выражение на 1000**: в AST координата всегда в метрах.
- Печать в Python **сокращает** это деление с обратным умножением, потому что SDK
  принимает миллиметры. В скачанном файле стоит `y`, а не `(y / 1000) * 1000`.

---

## Числа задания

| Что | Значение |
|---|---|
| Детали (3 шт.) | куб 40 мм, x 450 мм, y −100 / 0 / +100 мм, z 20 мм |
| Ячейки паллеты (3 шт.) | 90 × 90 × 60 мм, x 250 мм, те же y, z 30 мм |
| Высота подхода | z 220 мм |
| Высота захвата | z 60 мм |
| Ориентация инструмента | rx π, ry 0, rz 0 — инструмент вниз |
| Ограничение | не больше 13 инструкций |

Обе линии — по одну сторону от основания: движение по прямой между ними не
проходит через ось первого сустава и не вырождается. Достижимость и захват
проверяются прогоном эталонной программы (задача 5), а не на глаз.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `packages/sim-core/src/program/ast.ts` | изменяется: `Value`, `PoseInput`, цель `moveL` |
| `packages/sim-core/src/program/parse.ts` | изменяется: координата — число либо выражение |
| `packages/sim-core/src/interpreter/run.ts` | изменяется: разрешение координат перед планированием |
| `packages/sim-core/src/index.ts` | изменяется: экспорт `Value`, `PoseInput` |
| `packages/blocks/src/blocks.ts` | изменяется: пять блоков и категория |
| `packages/blocks/src/to-ast.ts` | изменяется: выражения из разъёмов |
| `packages/blocks/src/to-python.ts` | изменяется: печать вычисляемых координат |
| `components/simulator/blockly-skin.ts` | изменяется: значок категории |
| `content/.../06-polnyj-cikl/` | новый: теория, задание, стартовая и эталонная программы, обучение |
| `tests/sim/lesson-six.test.ts` | новый |
| `tests/e2e/lesson-six.spec.ts` | новый |

Ветка уже создана: `feat/lesson-six`.

---

### Task 1: Вычисляемая координата в ядре

**Files:**
- Modify: `packages/sim-core/src/program/ast.ts`, `packages/sim-core/src/program/parse.ts`, `packages/sim-core/src/interpreter/run.ts`, `packages/sim-core/src/index.ts`
- Test: `packages/sim-core/src/program/parse.test.ts`, `packages/sim-core/src/interpreter/run.test.ts`

- [ ] **Step 1: Написать падающий тест разбора**

Добавить в конец `packages/sim-core/src/program/parse.test.ts`:

```ts
describe('вычисляемая координата', () => {
  const base = {
    version: 1,
    body: [
      {
        op: 'moveL',
        pose: {
          x: 0.45,
          y: {
            kind: 'binary',
            operator: '/',
            left: { kind: 'variable', name: 'y' },
            right: { kind: 'number', value: 1000 },
          },
          z: 0.22,
          rx: 3.1416,
          ry: 0,
          rz: 0,
        },
        speed: 0.5,
        acc: 0.5,
      },
    ],
  };

  it('принимает выражение вместо числа', () => {
    const program = parseProgram(base);
    const statement = program.body[0]!;
    if (statement.op !== 'moveL') throw new Error('ожидалось движение по прямой');

    expect(statement.pose.x).toBe(0.45);
    expect(statement.pose.y).toEqual({
      kind: 'binary',
      operator: '/',
      left: { kind: 'variable', name: 'y' },
      right: { kind: 'number', value: 1000 },
    });
  });

  it('мусор вместо координаты называет место', () => {
    const broken = { ...base, body: [{ ...base.body[0], pose: { ...base.body[0]!.pose, y: 'сюда' } }] };
    expect(() => parseProgram(broken)).toThrow(/body\[0\]\.pose\.y/);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/program/parse.test.ts`
Expected: FAIL — `pose.y: ожидалось конечное число`.

- [ ] **Step 3: Реализовать тип**

В `packages/sim-core/src/program/ast.ts` рядом с `Pose` добавить:

```ts
/**
 * Значение в программе: число либо выражение, считаемое на ходу.
 *
 * Литерал остаётся числом, а не оборачивается в `{kind:'number'}`: иначе каждое
 * задание и каждая стартовая программа в репозитории пришлось бы переписать
 * ради единообразия, которого никто не увидит.
 */
export type Value = number | Expression;

/**
 * Цель движения в программе: любая координата может считаться по переменным.
 *
 * Не то же, что `Pose`: та — число, и ею живёт кинематика. Интерпретатор
 * разрешает выражения по текущим переменным и отдаёт планировщику числовую позу.
 */
export interface PoseInput {
  readonly x: Value;
  readonly y: Value;
  readonly z: Value;
  readonly rx: Value;
  readonly ry: Value;
  readonly rz: Value;
}
```

и заменить цель движения по прямой:

```ts
/** Движение по прямой: фланец идёт в точку по отрезку. */
type MoveL = { readonly op: 'moveL'; readonly pose: PoseInput } & MotionParams;
```

`Expression` объявлен в этом же файле выше — переносить ничего не нужно.

- [ ] **Step 4: Реализовать разбор**

В `packages/sim-core/src/program/parse.ts` заменить `parsePose` на разбор
вычисляемой позы (имя функции меняется, вызов в `parseCommand` — тоже):

```ts
function parsePoseInput(input: unknown, path: string): PoseInput {
  const record = asRecord(input, path);
  return {
    x: parseValue(record['x'], `${path}.x`),
    y: parseValue(record['y'], `${path}.y`),
    z: parseValue(record['z'], `${path}.z`),
    rx: parseValue(record['rx'], `${path}.rx`),
    ry: parseValue(record['ry'], `${path}.ry`),
    rz: parseValue(record['rz'], `${path}.rz`),
  };
}

/** Координата — либо число, либо выражение: правило одно на все шесть. */
function parseValue(input: unknown, path: string): Value {
  return typeof input === 'number' ? asNumber(input, path) : parseExpression(input, path);
}
```

Импорт типов в шапке файла дополнить: `type PoseInput`, `type Value` вместо
`type Pose`, если `Pose` больше нигде в файле не используется (проверит
компилятор).

- [ ] **Step 5: Прогнать разбор**

Run: `npx vitest run packages/sim-core/src/program/parse.test.ts`
Expected: PASS.

- [ ] **Step 6: Написать падающий тест исполнения**

Добавить в конец `packages/sim-core/src/interpreter/run.test.ts`:

```ts
describe('движение по вычисленной координате', () => {
  it('планировщик получает число, а не выражение', () => {
    // `jumpPlanner` позу не смотрит, поэтому здесь свой: он её запоминает.
    const seen: Pose[] = [];
    const recording: MotionPlanner = {
      ...jumpPlanner,
      planLinear: (_from, target) => {
        seen.push(target);
        return planned({ joints: [0, 0, 0, 0, 0, 0], ticks: 10, waypoints: [[0, 0, 0, 0, 0, 0]] });
      },
    };

    const result = run(
      program(
        { op: 'setVar', name: 'y', value: { kind: 'number', value: 100 } },
        {
          op: 'moveL',
          pose: {
            x: 0.35,
            y: {
              kind: 'binary',
              operator: '/',
              left: { kind: 'variable', name: 'y' },
              right: { kind: 'number', value: 1000 },
            },
            z: 0.2,
            rx: Math.PI,
            ry: 0,
            rz: 0,
          },
          speed: 0.5,
          acc: 0.5,
        },
      ),
      world(),
      recording,
    );

    expect(result.error).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.y).toBeCloseTo(0.1, 9);
    expect(seen[0]!.x).toBeCloseTo(0.35, 9);
  });
});
```

`run`, `program`, `world` и `jumpPlanner` — помощники, уже заведённые в этом
файле; `planned` импортируется там же, где `refused`. Тип `Pose` дописать в
импорт.

- [ ] **Step 7: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/sim-core/src/interpreter/run.test.ts`
Expected: FAIL — планировщик получает объект вместо числа.

- [ ] **Step 8: Реализовать исполнение**

В `packages/sim-core/src/interpreter/run.ts` заменить ветку движения по прямой:

```ts
    case 'moveL': {
      // Координаты считаются здесь, а не в планировщике: планировщик знает
      // кинематику и ничего не знает про переменные программы.
      const pose = resolvePose(statement.pose, state.world.variables);
      return executeMotion(
        state,
        statement,
        planner.planLinear(state.world.joints, pose, statement),
        planner,
      );
    }
```

и добавить рядом с `evaluate`:

```ts
/** Числовая поза из вычисляемой: выражения разрешаются по текущим переменным. */
function resolvePose(pose: PoseInput, variables: Readonly<Record<string, number>>): Pose {
  return {
    x: resolveValue(pose.x, variables),
    y: resolveValue(pose.y, variables),
    z: resolveValue(pose.z, variables),
    rx: resolveValue(pose.rx, variables),
    ry: resolveValue(pose.ry, variables),
    rz: resolveValue(pose.rz, variables),
  };
}

function resolveValue(value: Value, variables: Readonly<Record<string, number>>): number {
  return typeof value === 'number' ? value : evaluate(value, variables);
}
```

Импорты типов `Pose`, `PoseInput`, `Value` в шапке файла дополнить.

- [ ] **Step 9: Открыть типы наружу**

В `packages/sim-core/src/index.ts` в экспорт из `./program/ast` дописать
`type PoseInput` и `type Value`.

- [ ] **Step 10: Прогнать всё**

Run: `npm test` затем `npm run typecheck`
Expected: PASS, typecheck чисто. Существующие программы разбираются и исполняются
как раньше: литеральные координаты остались числами.

- [ ] **Step 11: Коммит**

```bash
git add packages/sim-core
git commit -m "feat: координата движения может быть выражением"
```

---

### Task 2: Блоки переменных и вычисляемого движения

**Files:**
- Modify: `packages/blocks/src/blocks.ts`, `components/simulator/blockly-skin.ts`

- [ ] **Step 1: Объявить типы блоков**

В `packages/blocks/src/blocks.ts` в `BLOCK_TYPES` дописать пять строк:

```ts
  moveComputed: 'pp_move_computed',
  number: 'pp_number',
  variable: 'pp_var',
  math: 'pp_math',
  setVar: 'pp_set_var',
```

- [ ] **Step 2: Описать блоки**

В том же файле, рядом с остальными определениями блоков, добавить:

```ts
  {
    type: BLOCK_TYPES.number,
    message0: '%1',
    args0: [{ type: 'field_number', name: 'VALUE', value: 0 }],
    output: 'Number',
    colour: COLORS.calculate,
    tooltip: 'Число',
  },
  {
    type: BLOCK_TYPES.variable,
    message0: '%1',
    args0: [{ type: 'field_input', name: 'NAME', text: 'i' }],
    output: 'Number',
    colour: COLORS.variable,
    tooltip: 'Значение переменной',
  },
  {
    type: BLOCK_TYPES.math,
    message0: '%1 %2 %3',
    args0: [
      { type: 'input_value', name: 'LEFT', check: 'Number' },
      {
        type: 'field_dropdown',
        name: 'OP',
        options: [
          ['+', '+'],
          ['−', '-'],
          ['×', '*'],
          ['÷', '/'],
        ],
      },
      { type: 'input_value', name: 'RIGHT', check: 'Number' },
    ],
    inputsInline: true,
    output: 'Number',
    colour: COLORS.calculate,
    tooltip: 'Арифметика',
  },
  {
    type: BLOCK_TYPES.setVar,
    message0: 'задать %1 = %2',
    args0: [
      { type: 'field_input', name: 'NAME', text: 'i' },
      { type: 'input_value', name: 'VALUE', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.variable,
    tooltip: 'Записать значение в переменную',
  },
  {
    type: BLOCK_TYPES.moveComputed,
    message0: 'по прямой, мм X %1 Y %2 Z %3',
    args0: [
      { type: 'input_value', name: 'X', check: 'Number' },
      { type: 'input_value', name: 'Y', check: 'Number' },
      { type: 'input_value', name: 'Z', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: COLORS.move,
    tooltip: 'Движение по прямой, координаты считаются на ходу',
  },
```

Ориентация у вычисляемого движения не задаётся: инструмент смотрит вниз
(`rx = π`), как в блоке показа точки по умолчанию. Паллетированию этого хватает,
а шесть разъёмов вместо трёх сделали бы блок нечитаемым.

- [ ] **Step 3: Добавить категорию в палитру**

В `TOOLBOX` дописать блок вычисляемого движения в категорию «Движение»:

```ts
        { kind: 'block', type: BLOCK_TYPES.moveComputed },
```

и добавить категорию последней, после «Управления»:

```ts
    {
      kind: 'category',
      name: 'Переменные',
      colour: COLORS.variable,
      cssconfig: { icon: 'ppIconVar' },
      contents: [
        { kind: 'block', type: BLOCK_TYPES.setVar },
        { kind: 'block', type: BLOCK_TYPES.variable },
        { kind: 'block', type: BLOCK_TYPES.number },
        { kind: 'block', type: BLOCK_TYPES.math },
      ],
    },
```

- [ ] **Step 4: Нарисовать значок категории**

В `components/simulator/blockly-skin.ts` в конец `CATEGORY_ICONS` добавить:

```ts
  {
    css: 'ppIconVar',
    colour: COLORS.variable,
    path: "<path d='M3 3.5v9'/><path d='M3 8h5'/><path d='M13 3.5 8.5 12.5'/>",
  },
```

- [ ] **Step 5: Проверить сборку**

Run: `npm run typecheck` затем `npm run build`
Expected: оба чисто.

- [ ] **Step 6: Коммит**

```bash
git add packages/blocks/src/blocks.ts components/simulator/blockly-skin.ts
git commit -m "feat: блоки переменных и движения с вычисляемыми координатами"
```

---

### Task 3: Сборка блоков в AST

**Files:**
- Modify: `packages/blocks/src/to-ast.ts`
- Test: `packages/blocks/src/to-ast.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `packages/blocks/src/to-ast.test.ts`. Помощник `block` там уже
есть, и аргументы у него позиционные: `block(type, fields, inputs, next)`.

```ts
describe('переменные и вычисляемое движение', () => {
  it('собирает присваивание с арифметикой', () => {
    const program = toAst(
      block(
        BLOCK_TYPES.setVar,
        { NAME: 'y' },
        {
          VALUE: block(
            BLOCK_TYPES.math,
            { OP: '+' },
            {
              LEFT: block(BLOCK_TYPES.number, { VALUE: -100 }),
              RIGHT: block(
                BLOCK_TYPES.math,
                { OP: '*' },
                {
                  LEFT: block(BLOCK_TYPES.variable, { NAME: 'i' }),
                  RIGHT: block(BLOCK_TYPES.number, { VALUE: 100 }),
                },
              ),
            },
          ),
        },
      ),
    );

    expect(program.body[0]).toEqual({
      op: 'setVar',
      name: 'y',
      value: {
        kind: 'binary',
        operator: '+',
        left: { kind: 'number', value: -100 },
        right: {
          kind: 'binary',
          operator: '*',
          left: { kind: 'variable', name: 'i' },
          right: { kind: 'number', value: 100 },
        },
      },
    });
  });

  it('координата вычисляемого движения переводится в метры делением', () => {
    const program = toAst(
      block(
        BLOCK_TYPES.moveComputed,
        {},
        {
          X: block(BLOCK_TYPES.number, { VALUE: 450 }),
          Y: block(BLOCK_TYPES.variable, { NAME: 'y' }),
          Z: block(BLOCK_TYPES.number, { VALUE: 220 }),
        },
      ),
    );

    const statement = program.body[0]!;
    if (statement.op !== 'moveL') throw new Error('ожидалось движение по прямой');

    expect(statement.pose.y).toEqual({
      kind: 'binary',
      operator: '/',
      left: { kind: 'variable', name: 'y' },
      right: { kind: 'number', value: 1000 },
    });
    // Инструмент вниз: ориентация у этого блока не набирается.
    expect(statement.pose.rx).toBeCloseTo(Math.PI, 6);
  });

  it('пустой разъём координаты — ошибка, а не молчаливый ноль', () => {
    expect(() =>
      toAst(
        block(BLOCK_TYPES.moveComputed, {}, { X: block(BLOCK_TYPES.number, { VALUE: 450 }) }),
      ),
    ).toThrow(/координата Y/);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/blocks/src/to-ast.test.ts`
Expected: FAIL — «редактор не знает такой команды».

- [ ] **Step 3: Реализовать**

В `packages/blocks/src/to-ast.ts` добавить ветки в `translate`:

```ts
    case BLOCK_TYPES.setVar:
      return {
        op: 'setVar',
        name: variableName(block),
        value: expression(block.getInputTargetBlock('VALUE'), block, 'значение'),
      };

    case BLOCK_TYPES.moveComputed:
      return {
        op: 'moveL',
        pose: {
          x: coordinate(block, 'X'),
          y: coordinate(block, 'Y'),
          z: coordinate(block, 'Z'),
          // Инструмент вниз: ориентация у этого блока не набирается.
          rx: Math.PI,
          ry: 0,
          rz: 0,
        },
        speed: context.speed,
        acc: DEFAULT_ACC,
      };
```

и помощники рядом с `condition`:

```ts
/**
 * Выражение из разъёма.
 *
 * Пустой разъём здесь — ошибка, в отличие от пустого условия. У условия есть
 * естественное нейтральное значение — «не сработало», и наполовину собранную
 * программу с ним можно запустить. У координаты такого значения нет: ноль — это
 * настоящее место, и робот молча поехал бы в него.
 */
function expression(block: BlockLike | null, owner: BlockLike, what: string): Expression {
  if (block === null) {
    throw new BlockTranslationError(owner.type, `не задано ${what}`);
  }

  switch (block.type) {
    case BLOCK_TYPES.number:
      return { kind: 'number', value: number(block, 'VALUE') };

    case BLOCK_TYPES.variable:
      return { kind: 'variable', name: variableName(block) };

    case BLOCK_TYPES.math:
      return {
        kind: 'binary',
        operator: operator(block),
        left: expression(block.getInputTargetBlock('LEFT'), block, 'левое число'),
        right: expression(block.getInputTargetBlock('RIGHT'), block, 'правое число'),
      };

    default:
      throw new BlockTranslationError(block.type, 'этот блок не даёт значения');
  }
}

/** Координата из разъёма: ученик пишет миллиметры, ядро хранит метры. */
function coordinate(block: BlockLike, input: string): Value {
  return {
    kind: 'binary',
    operator: '/',
    left: expression(block.getInputTargetBlock(input), block, `координата ${input}`),
    right: { kind: 'number', value: MM },
  };
}

function variableName(block: BlockLike): string {
  const name = String(block.getFieldValue('NAME') ?? '').trim();
  if (name === '') throw new BlockTranslationError(block.type, 'у переменной нет имени');
  return name;
}

function operator(block: BlockLike): BinaryOperator {
  const value = String(block.getFieldValue('OP') ?? '+');
  if (value === '+' || value === '-' || value === '*' || value === '/') return value;
  throw new BlockTranslationError(block.type, `неизвестное действие «${value}»`);
}
```

Импорт в шапке файла дополнить: `type BinaryOperator`, `type Expression`,
`type Value` из `@prompower/sim-core`.

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run packages/blocks/`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/blocks
git commit -m "feat: редактор собирает выражения в координаты"
```

---

### Task 4: Печать вычисляемых координат в Python

**Files:**
- Modify: `packages/blocks/src/to-python.ts`
- Test: `packages/blocks/src/to-python.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Добавить в конец `packages/blocks/src/to-python.test.ts`:

```ts
describe('вычисляемые координаты', () => {
  const computed = (y: unknown) =>
    toPython({
      version: 1,
      body: [
        { op: 'setVar', name: 'y', value: { kind: 'number', value: -100 } },
        {
          op: 'moveL',
          pose: { x: 0.45, y, z: 0.22, rx: Math.PI, ry: 0, rz: 0 },
          speed: 0.5,
          acc: 0.5,
        },
      ],
    } as Program);

  it('переменная попадает в скрипт под своим именем', () => {
    const code = computed({
      kind: 'binary',
      operator: '/',
      left: { kind: 'variable', name: 'y' },
      right: { kind: 'number', value: 1000 },
    });

    // Деление на тысячу сокращается с обратным умножением: SDK принимает
    // миллиметры, и в файле стоит ровно то, что собрал ученик.
    expect(code).toContain('y = -100');
    expect(code).toMatch(/linear_move\(\[450\.000, y, 220\.000/);
    expect(code).not.toContain('/ 1000');
  });

  it('выражение без деления печатается в миллиметрах', () => {
    const code = computed({ kind: 'variable', name: 'y' });
    expect(code).toMatch(/\(y\) \* 1000/);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run packages/blocks/src/to-python.test.ts`
Expected: FAIL — координата печатается как `[object Object]` либо не собирается.

- [ ] **Step 3: Реализовать**

В `packages/blocks/src/to-python.ts` заменить сборку цели в ветке `moveL`:

```ts
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
```

(остальная часть ветки не меняется) и добавить рядом с `expression`:

```ts
/**
 * Координата в миллиметрах.
 *
 * Выражение из редактора приходит делённым на тысячу — ядро хранит метры.
 * Умножать его обратно значило бы печатать `(y / 1000) * 1000`, поэтому деление
 * сокращается: в файле стоит то, что собрал ученик.
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
```

Импорт `type Value` в шапке файла дополнить.

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run packages/blocks/`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add packages/blocks
git commit -m "feat: вычисляемые координаты попадают в скрипт как есть"
```

---

### Task 5: Содержание урока

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/task.json`
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/demo-program.json`
- Create: `tests/sim/lesson-six.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `tests/sim/lesson-six.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkTask,
  createPlanner,
  createRun,
  createWorld,
  parseProgram,
  parseTask,
  parseUrdfChain,
  runToCompletion,
  type Program,
  type RunState,
  type Statement,
} from '@prompower/sim-core';
import { jakaZu7 } from '@prompower/robot-plugins';

/**
 * Урок 6: разложить три детали по ячейкам паллеты циклом.
 *
 * Проверяется и то, что эталон проходит, и то, ради чего урок написан: без
 * цикла в ограничение уложиться нельзя, а с циклом — можно.
 */

const LESSON = 'content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl';

const task = parseTask(JSON.parse(readFileSync(`${LESSON}/task.json`, 'utf8')));
const demo = parseProgram(JSON.parse(readFileSync(`${LESSON}/demo-program.json`, 'utf8')));

const chain = parseUrdfChain(
  readFileSync('packages/robot-plugins/models/jaka-zu7/urdf/jaka-zu7.urdf', 'utf8'),
  jakaZu7.joints.map((joint) => joint.urdfName),
);
const planner = createPlanner(chain);

function run(program: Program): RunState {
  const world = createWorld({ ...task.world, joints: [...jakaZu7.homePose] });
  return runToCompletion(createRun(program, world), planner, { maxSteps: 4000 });
}

describe('задание «полный цикл»', () => {
  it('три детали и три ячейки', () => {
    expect(task.world.objects).toHaveLength(3);
    expect(task.goals).toHaveLength(3);
  });

  it('эталонная программа доходит до конца', () => {
    const result = run(demo);

    expect(result.error).toBeNull();
    expect(result.status).toBe('finished');
  });

  it('и раскладывает детали по ячейкам', () => {
    const result = run(demo);
    const check = checkTask(task, demo, result.world, result.log, chain);

    expect(check.failures).toEqual([]);
    expect(check.passed).toBe(true);
  });

  it('то же решение без цикла в ограничение не влезает', () => {
    const loop = demo.body.find((statement) => statement.op === 'repeat');
    if (loop === undefined || loop.op !== 'repeat') throw new Error('в эталоне нет цикла');

    // Три копии тела подряд вместо цикла — ровно то, что ученик напишет,
    // если решит обойтись без переменных.
    const unrolled: Program = {
      version: 1,
      body: [
        ...demo.body.filter((statement) => statement.op !== 'repeat'),
        ...([0, 1, 2].flatMap(() => [...loop.body]) as Statement[]),
      ],
    };

    const result = run(unrolled);
    const check = checkTask(task, unrolled, result.world, result.log, chain);

    expect(check.failures.some((failure) => failure.includes('разрешено не больше'))).toBe(true);
  });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `npx vitest run tests/sim/lesson-six.test.ts`
Expected: FAIL — `ENOENT`, файлов задания нет.

- [ ] **Step 3: Написать задание**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/task.json`:

```json
{
  "id": "polnyj-cikl",
  "world": {
    "objects": [
      { "id": "деталь 1", "position": { "x": 0.45, "y": -0.1, "z": 0.02 }, "size": { "x": 0.04, "y": 0.04, "z": 0.04 } },
      { "id": "деталь 2", "position": { "x": 0.45, "y": 0, "z": 0.02 }, "size": { "x": 0.04, "y": 0.04, "z": 0.04 } },
      { "id": "деталь 3", "position": { "x": 0.45, "y": 0.1, "z": 0.02 }, "size": { "x": 0.04, "y": 0.04, "z": 0.04 } }
    ],
    "zones": [
      { "id": "ячейка 1", "position": { "x": 0.25, "y": -0.1, "z": 0.03 }, "size": { "x": 0.09, "y": 0.09, "z": 0.06 } },
      { "id": "ячейка 2", "position": { "x": 0.25, "y": 0, "z": 0.03 }, "size": { "x": 0.09, "y": 0.09, "z": 0.06 } },
      { "id": "ячейка 3", "position": { "x": 0.25, "y": 0.1, "z": 0.03 }, "size": { "x": 0.09, "y": 0.09, "z": 0.06 } }
    ]
  },
  "goals": [
    { "type": "objectInZone", "object": "деталь 1", "zone": "ячейка 1" },
    { "type": "objectInZone", "object": "деталь 2", "zone": "ячейка 2" },
    { "type": "objectInZone", "object": "деталь 3", "zone": "ячейка 3" }
  ],
  "constraints": [{ "type": "maxStatements", "value": 13 }],
  "hints": [
    {
      "afterFailedAttempts": 2,
      "text": "Счётчик надо не только читать, но и увеличивать: последней строкой в цикле задайте i = i + 1."
    },
    {
      "afterFailedAttempts": 4,
      "text": "Место детали считается один раз в начале витка: задайте y = −100 + i × 100 и подставляйте эту переменную во все движения витка."
    }
  ]
}
```

- [ ] **Step 4: Написать эталонную программу**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/demo-program.json`.
Координата Y во всех движениях витка одна и та же — переменная `y`, делённая на
тысячу; X и Z — числа в метрах:

```json
{
  "version": 1,
  "body": [
    { "op": "comment", "text": "Счётчик деталей" },
    { "op": "setVar", "name": "i", "value": { "kind": "number", "value": 0 } },
    {
      "op": "repeat",
      "times": 3,
      "body": [
        {
          "op": "setVar",
          "name": "y",
          "value": {
            "kind": "binary",
            "operator": "+",
            "left": { "kind": "number", "value": -100 },
            "right": {
              "kind": "binary",
              "operator": "*",
              "left": { "kind": "variable", "name": "i" },
              "right": { "kind": "number", "value": 100 }
            }
          }
        },
        { "op": "moveL", "pose": { "x": 0.45, "y": { "kind": "binary", "operator": "/", "left": { "kind": "variable", "name": "y" }, "right": { "kind": "number", "value": 1000 } }, "z": 0.22, "rx": 3.141593, "ry": 0, "rz": 0 }, "speed": 0.6, "acc": 0.5 },
        { "op": "moveL", "pose": { "x": 0.45, "y": { "kind": "binary", "operator": "/", "left": { "kind": "variable", "name": "y" }, "right": { "kind": "number", "value": 1000 } }, "z": 0.0605, "rx": 3.141593, "ry": 0, "rz": 0 }, "speed": 0.6, "acc": 0.5 },
        { "op": "gripper", "action": "close" },
        { "op": "moveL", "pose": { "x": 0.45, "y": { "kind": "binary", "operator": "/", "left": { "kind": "variable", "name": "y" }, "right": { "kind": "number", "value": 1000 } }, "z": 0.22, "rx": 3.141593, "ry": 0, "rz": 0 }, "speed": 0.6, "acc": 0.5 },
        { "op": "moveL", "pose": { "x": 0.25, "y": { "kind": "binary", "operator": "/", "left": { "kind": "variable", "name": "y" }, "right": { "kind": "number", "value": 1000 } }, "z": 0.22, "rx": 3.141593, "ry": 0, "rz": 0 }, "speed": 0.6, "acc": 0.5 },
        { "op": "moveL", "pose": { "x": 0.25, "y": { "kind": "binary", "operator": "/", "left": { "kind": "variable", "name": "y" }, "right": { "kind": "number", "value": 1000 } }, "z": 0.0605, "rx": 3.141593, "ry": 0, "rz": 0 }, "speed": 0.6, "acc": 0.5 },
        { "op": "gripper", "action": "open" },
        { "op": "moveL", "pose": { "x": 0.25, "y": { "kind": "binary", "operator": "/", "left": { "kind": "variable", "name": "y" }, "right": { "kind": "number", "value": 1000 } }, "z": 0.22, "rx": 3.141593, "ry": 0, "rz": 0 }, "speed": 0.6, "acc": 0.5 },
        {
          "op": "setVar",
          "name": "i",
          "value": {
            "kind": "binary",
            "operator": "+",
            "left": { "kind": "variable", "name": "i" },
            "right": { "kind": "number", "value": 1 }
          }
        }
      ]
    }
  ]
}
```

- [ ] **Step 5: Прогнать тест содержания**

Run: `npx vitest run tests/sim/lesson-six.test.ts`
Expected: PASS, 4 теста.

Если прогон не доходит до конца — читать `result.error`: это настоящий отказ
симулятора, а не придирка теста. Вероятные причины и что править:
- «точка недостижима» — уменьшить X линии деталей (0.45 → 0.40) и повторить;
- деталь не взялась — высота захвата берётся из урока 4, там она 0.0605;
- шагов не хватило — поднять `maxSteps` в тесте.

- [ ] **Step 6: Коммит**

```bash
git add content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl tests/sim/lesson-six.test.ts
git commit -m "feat: задание урока 6 — паллетирование в цикле"
```

---

### Task 6: Теория и стартовая программа

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/lesson.ru.mdx`
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/starter.json`

- [ ] **Step 1: Написать теорию**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/lesson.ru.mdx`:

```mdx
---
title: Полный цикл
description: Переменные, счётчик и цикл: одна программа вместо трёх одинаковых, а место каждой детали считается на ходу.
minutes: 4
---

Всё, что нужно для паллетирования, вы уже умеете: подойти, взять, перенести,
отпустить. Осталось не писать это трижды.

## Почему не скопировать

Скопировать можно — три детали, три копии, и программа готова. Беда начинается
на четвёртой: копий становится четыре, и каждая правка делается четыре раза.
Ошибётесь в одной — найдёте это не в редакторе, а на настоящей ячейке.

Поэтому пишут по-другому: одно описание работы и счётчик, который говорит, с
какой деталью работаем сейчас.

## Переменная и счётчик

**Переменная** — это имя, за которым стоит число. Ей можно что-то задать и
потом читать сколько угодно раз. Переменная `i`, которая на каждом витке
увеличивается на единицу, называется **счётчиком**: по нему видно, какой виток
идёт.

Увеличивается счётчик не сам. Это отдельная строка в конце витка:

```
задать i = i + 1
```

Читается это не как равенство — равенство тут неверное, — а как приказ:
«возьми то, что сейчас в i, прибавь единицу и положи обратно».

## Место, посчитанное на ходу

Детали стоят в ряд через сто миллиметров. Значит, место детали номер `i` — это
координата первой детали плюс сто, умноженное на `i`:

```
задать y = −100 + i × 100
```

На первом витке `i` равно нулю и `y` выходит −100, на втором 0, на третьем 100.
Одна строка вместо трёх наборов координат.

Дальше эту переменную подставляют в блок движения с вычисляемыми координатами —
он отличается от обычного тем, что вместо полей у него разъёмы: туда встаёт
число, переменная или целое выражение.

**Считайте место один раз в начале витка.** В витке восемь движений, и во всех
восьми Y одинаковый; если каждый раз собирать выражение заново, программа
станет нечитаемой, а ошибётесь вы ровно в одном из восьми.

## Что дальше

Всё это работает и на настоящем роботе: скачанный скрипт содержит те же
переменные и тот же цикл. Отсюда же начинается паллетирование в два измерения —
второй счётчик и второй ряд, — и мастера упаковки, которые эту арифметику
прячут за диалогом. Но прячут они ровно то, что вы сейчас написали руками.

## Задание

В стартовой программе собрана работа с первой деталью: подойти, взять,
перенести в ячейку, отпустить. Превратите её в цикл на три детали.

Понадобится: счётчик, переменная места, блок движения с вычисляемыми
координатами и увеличение счётчика в конце витка. В программу должно уложиться
не больше тринадцати инструкций — три копии в них не поместятся.
```

- [ ] **Step 2: Собрать стартовую программу**

Стартовая программа — холст Blockly, а не AST: формат тот же, что у соседних
уроков (`{ blocks: { languageVersion: 0, blocks: [ ... ] } }`, цепочка через
`next.block`). Писать сто строк вложенности руками незачем — собрать скриптом:

```bash
node -e "
const fs = require('node:fs');
const dir = 'content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl';

const move = (x, y, z) => ({
  type: 'pp_move_linear',
  fields: { X: x, Y: y, Z: z, RX: 180, RY: 0, RZ: 0 },
});

// Работа с первой деталью: подойти, взять, перенести, отпустить, подняться.
const chain = [
  { type: 'pp_set_speed', fields: { PERCENT: 60 } },
  { type: 'pp_comment', fields: { TEXT: 'Деталь 1: взять и положить в ячейку 1' } },
  move(450, -100, 220),
  move(450, -100, 60),
  { type: 'pp_gripper', fields: { ACTION: 'close' } },
  move(450, -100, 220),
  move(250, -100, 220),
  move(250, -100, 60),
  { type: 'pp_gripper', fields: { ACTION: 'open' } },
  move(250, -100, 220),
];

const nested = chain.reduceRight((next, block) => (next === null ? block : { ...block, next: { block: next } }), null);
fs.writeFileSync(dir + '/starter.json', JSON.stringify({ blocks: { languageVersion: 0, blocks: [nested] } }, null, 2) + '\n');
console.log('собрано блоков:', chain.length);
"
```

Expected: `собрано блоков: 10`.

Имена полей сверены с определениями блоков: `PERCENT`, `TEXT`, `ACTION`, а у
движения по прямой — `X`, `Y`, `Z`, `RX`, `RY`, `RZ`.

- [ ] **Step 3: Проверить глазами**

Run: `npm run dev`, открыть `http://localhost:3000/ru/lesson/polnyj-cikl`

Проверить:
- теория читается, кнопка «К заданию» открывает задание;
- в сцене три детали в ряд и три ячейки паллеты;
- стартовая программа собрана из блоков и запускается: первая деталь
  перекладывается, вердикт называет две оставшиеся;
- в палитре есть категория «Переменные», а в «Движении» — блок с разъёмами;
- собранный вручную цикл доводит задание до зачёта.

- [ ] **Step 4: Коммит**

```bash
git add content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl
git commit -m "feat: теория урока 6 и стартовая программа"
```

---

### Task 7: Обучение урока

**Files:**
- Create: `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/tour.ru.json`

- [ ] **Step 1: Написать сценарий**

Создать `content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/tour.ru.json`:

```json
{
  "steps": [
    {
      "target": "[data-testid=theory-start]",
      "text": "Теория прочитана — переходите к заданию.",
      "done": "click"
    },
    {
      "target": "[data-category=Переменные]",
      "text": "Откройте «Переменные» — здесь счётчик, арифметика и блок «задать».",
      "done": "click"
    },
    {
      "target": "[data-testid=block-editor]",
      "text": "Соберите цикл: задайте i = 0 до цикла, повторите три раза работу с деталью, а в конце витка увеличьте счётчик. Место детали считайте переменной и подставляйте в блок движения с разъёмами.",
      "done": { "op": "repeat", "count": 1 }
    },
    {
      "target": "[data-testid=play]",
      "text": "Программа собрана — запускайте.",
      "done": "click"
    },
    {
      "target": "[data-testid=verdict]",
      "text": "Задание выполнено — и курс тоже. Дальше вы сами.",
      "done": "passed"
    }
  ]
}
```

- [ ] **Step 2: Коммит**

```bash
git add content/courses/osnovy-raboty-s-kobotom/lessons/06-polnyj-cikl/tour.ru.json
git commit -m "feat: обучение урока 6 ведёт к циклу"
```

---

### Task 8: Сквозной тест

**Files:**
- Create: `tests/e2e/lesson-six.spec.ts`

Сборку двенадцати блоков перетаскиванием сквозной тест не воспроизводит — это
проверяется прогоном эталонной программы в `tests/sim`. Здесь проверяется
проводка урока: палитра, стартовая программа, прогон и вердикт.

- [ ] **Step 1: Написать тест**

Создать `tests/e2e/lesson-six.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

/**
 * Урок 6: итоговое задание.
 *
 * Сборка цикла руками здесь не воспроизводится — она проверена прогоном
 * эталонной программы без браузера. Проверяется проводка: в палитре есть
 * переменные, стартовая программа запускается, а вердикт честно называет
 * детали, которые остались на месте.
 */

const LESSON = '/ru/lesson/polnyj-cikl';

test.beforeEach(async ({ page }) => {
  await page.goto(LESSON);
  await page.getByTestId('theory-start').click();
  await page.getByTestId('tour-skip').click();
  await expect(page.locator('[data-testid="block-editor"] svg.blocklySvg')).toBeVisible({
    timeout: 30_000,
  });
});

test('в палитре есть переменные и вычисляемое движение', async ({ page }) => {
  await page.locator('[data-category="Переменные"]').click({ force: true });
  await expect(page.locator('.blocklyFlyout .pp_set_var')).toBeVisible();

  await page.locator('[data-category="Движение"]').click({ force: true });
  await expect(page.locator('.blocklyFlyout .pp_move_computed')).toBeVisible();
});

test('задание объявляет три цели', async ({ page }) => {
  await expect(page.getByText('Переставить «деталь 1» в «ячейка 1»')).toBeVisible();
  await expect(page.getByText('Переставить «деталь 3» в «ячейка 3»')).toBeVisible();
});

test('стартовая программа кладёт одну деталь и честно говорит про остальные', async ({ page }) => {
  await page.getByTestId('play').click();

  await expect(page.getByTestId('verdict')).toContainText('Задание не выполнено', {
    timeout: 120_000,
  });
  await expect(page.getByTestId('verdict')).toContainText('деталь 2');
});
```

- [ ] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/lesson-six.spec.ts`
Expected: PASS, 3 теста.

- [ ] **Step 3: Коммит**

```bash
git add tests/e2e/lesson-six.spec.ts
git commit -m "test: урок 6 проводит задание от палитры до вердикта"
```

---

### Task 9: Карта курса, README и полная проверка

**Files:**
- Modify: `tests/e2e/course.spec.ts`, `README.md`

- [ ] **Step 1: Поправить карту курса**

В `tests/e2e/course.spec.ts` в тесте «курс начинается с урока о коботе» уроков
стало шесть:

```ts
  expect(titles).toHaveLength(6);
```

и дописать проверку последнего:

```ts
  expect(titles.at(-1)).toBe('Полный цикл');
```

Тест «последний урок честно говорит, что он последний» открывает
`/ru/lesson/vhody-i-vyhody` — теперь последний урок другой. Заменить адрес на
`/ru/lesson/polnyj-cikl`.

- [ ] **Step 2: Обновить README**

В разделе «Что уже работает» дописать после абзаца об уроке о безопасности:

```markdown
Курс заканчивается итоговым заданием: три детали раскладываются по ячейкам
паллеты циклом со счётчиком, а место каждой детали считается выражением прямо в
координате движения. Те же переменные и тот же цикл попадают в скачанный скрипт
на Python.
```

и в разделе «Дальше по фазам» вычеркнуть пункт про содержание курса, если он там
остался.

- [ ] **Step 3: Полная проверка**

Run: `npm run typecheck`, затем `npm test`, затем `npm run build`, затем
`npm run test:e2e`
Expected: typecheck чисто; Vitest зелёный; сборка проходит; Playwright зелёный
целиком, включая уроки 1–5 — их задания и стартовые программы не менялись.

- [ ] **Step 4: Коммит**

```bash
git add README.md tests/e2e/course.spec.ts
git commit -m "docs: курс закончен шестым уроком"
```

- [ ] **Step 5: Отметить шаги плана и закрыть ветку**

Проставить галочки в этом файле, закоммитить, затем перейти к скиллу
`superpowers:finishing-a-development-branch`.
