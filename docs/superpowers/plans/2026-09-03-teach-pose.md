# Обучение позы серой копией робота — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** заменить набор позы числами на показ позы роботу — серая копия модели, ползунки суставов, «Сохранить» пишет позу в блок движения.

**Architecture:** поза остаётся полями блока Blockly. Кнопка внутри блока шлёт событие наружу, экран урока поднимает серую копию робота в сцене и панель ползунков вместо условия задания, сохранение пишет поля обратно в блок — дальше работает существующая цепочка «блоки → AST → сцена». Перевод между полями блока и углами суставов вынесен в чистый модуль и покрыт unit-тестами.

**Tech Stack:** Next.js 15, TypeScript strict, Blockly 12, three.js через @react-three/fiber, `@prompower/sim-core` (своя кинематика), Vitest, Playwright.

Спека: [../specs/2026-09-03-teach-pose-design.md](../specs/2026-09-03-teach-pose-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `packages/blocks/src/blocks.ts` | изменяется: поля RX/RY/RZ у «по прямой», расширение с кнопкой у обоих блоков движения |
| `packages/blocks/src/to-ast.ts` | изменяется: ориентация читается из полей, `TOOL_DOWN` уходит |
| `packages/blocks/src/index.ts` | изменяется: экспорт имени расширения и подписи кнопки |
| `components/simulator/teach-pose.ts` | новый: чистый перевод «поля блока ↔ углы суставов». Знает про `sim-core`, не знает про Blockly и three.js |
| `components/simulator/teach-field.ts` | новый: поле-кнопка Blockly и событие наружу. Единственное место, где Blockly встречается с обучением |
| `components/simulator/ghost-robot.tsx` | новый: серая копия модели в сцене |
| `components/simulator/teach-panel.tsx` | новый: панель обучения — заголовок, ползунки, поза фланца, кнопки |
| `components/simulator/block-editor.tsx` | изменяется: отдаёт запрос на обучение наружу, умеет записать поля обратно |
| `components/simulator/program-panel.tsx` | изменяется: пробрасывает то и другое |
| `components/simulator/lesson-workspace.tsx` | изменяется: состояние обучения, подмена левой колонки, пауза прогона |
| `messages/ru.json`, `messages/en.json` | изменяются: подписи панели |
| `tests/e2e/lesson.spec.ts` | изменяется: сценарий обучения |

Единицы: внутри всё в радианах и метрах, в полях блока — градусы и миллиметры. Перевод живёт только в `to-ast.ts` (блоки → ядро) и `teach-pose.ts` (обучение → блоки).

---

### Task 1: Ориентация и кнопка в определениях блоков

**Files:**
- Modify: `packages/blocks/src/blocks.ts`
- Modify: `packages/blocks/src/to-ast.ts`
- Modify: `packages/blocks/src/index.ts`
- Test: `packages/blocks/src/to-ast.test.ts`

- [ ] **Step 1: Поправить существующие тесты «по прямой» и добавить новый**

В `packages/blocks/src/to-ast.test.ts` заменить тест «переводит миллиметры в метры и держит инструмент вниз» на два:

```typescript
  it('переводит миллиметры в метры', () => {
    const program = toAst(
      block(BLOCK_TYPES.moveLinear, { X: 350, Y: -200, Z: 60, RX: 180, RY: 0, RZ: 0 }),
    );

    const statement = program.body[0]!;
    expect(statement.op).toBe('moveL');
    if (statement.op !== 'moveL') return;
    expect(statement.pose.x).toBeCloseTo(0.35, 9);
    expect(statement.pose.y).toBeCloseTo(-0.2, 9);
    expect(statement.pose.z).toBeCloseTo(0.06, 9);
  });

  it('берёт ориентацию из полей блока, а не из константы', () => {
    const program = toAst(
      block(BLOCK_TYPES.moveLinear, { X: 0, Y: 0, Z: 100, RX: 90, RY: -45, RZ: 30 }),
    );

    const statement = program.body[0]!;
    expect(statement.op).toBe('moveL');
    if (statement.op !== 'moveL') return;
    expect(statement.pose.rx).toBeCloseTo(Math.PI / 2, 9);
    expect(statement.pose.ry).toBeCloseTo(-Math.PI / 4, 9);
    expect(statement.pose.rz).toBeCloseTo(Math.PI / 6, 9);
  });
```

Дальше в этом же файле во всех остальных вызовах `block(BLOCK_TYPES.moveLinear, { X: …, Y: …, Z: … })` добавить `RX: 180, RY: 0, RZ: 0`. Без этого `number(block, 'RX')` бросит: полей у макета нет.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm test -- to-ast`
Expected: FAIL, `Блок «pp_move_linear»: поле RX не число`.

- [ ] **Step 3: Добавить поля и расширение в определения блоков**

В `packages/blocks/src/blocks.ts` заменить пункт 3 верхнего комментария:

```typescript
 * 3. Точку показывают роботу. Как и на планшете, поза не набирается числами:
 *    кнопка в блоке поднимает серую копию робота, её доводят ползунками до
 *    нужного места и сохраняют. Числа в полях остаются видимыми и правятся
 *    руками — это тот же источник истины, просто заполняется он показом.
```

Ниже `BLOCK_TYPES` добавить:

```typescript
/**
 * Расширение Blockly, которое вешает на блок кнопку показа точки.
 *
 * Здесь только имя: сам обработчик живёт в слое приложения, потому что ему
 * нужны Blockly и сцена, а этот пакет остаётся данными без импортов.
 */
export const TEACH_EXTENSION = 'pp_teach';

/** Подпись кнопки. Русская, как и весь текст блоков. */
export const TEACH_LABEL = 'показать роботу';
```

В определении `BLOCK_TYPES.moveJoint` добавить строку после `colour`:

```typescript
    extensions: [TEACH_EXTENSION],
```

Определение `BLOCK_TYPES.moveLinear` заменить целиком:

```typescript
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
```

Значения по умолчанию 180/0/0 — это прежний «инструмент строго вниз»: в уже сохранённых программах полей RX/RY/RZ нет, Blockly заполнит их сам, и поведение не изменится.

- [ ] **Step 4: Прочитать ориентацию в генераторе AST**

В `packages/blocks/src/to-ast.ts` удалить константу `TOOL_DOWN` вместе с её комментарием и заменить ветку `moveLinear`:

```typescript
    case BLOCK_TYPES.moveLinear:
      return {
        op: 'moveL',
        pose: {
          x: number(block, 'X') / MM,
          y: number(block, 'Y') / MM,
          z: number(block, 'Z') / MM,
          rx: number(block, 'RX') * DEG_TO_RAD,
          ry: number(block, 'RY') * DEG_TO_RAD,
          rz: number(block, 'RZ') * DEG_TO_RAD,
        },
        speed: context.speed,
        acc: DEFAULT_ACC,
      };
```

- [ ] **Step 5: Экспортировать новые имена**

В `packages/blocks/src/index.ts` первую строку заменить на:

```typescript
export {
  BLOCK_DEFINITIONS,
  BLOCK_TYPES,
  COLORS,
  TEACH_EXTENSION,
  TEACH_LABEL,
  TOOLBOX,
} from './blocks';
```

- [ ] **Step 6: Прогнать тесты**

Run: `npm test`
Expected: PASS, все файлы зелёные (включая `to-python.test.ts` — он уже печатал rx/ry/rz).

- [ ] **Step 7: Коммит**

```bash
git add packages/blocks
git commit -m "feat: у движения по прямой своя ориентация вместо жёсткого «вниз»"
```

---

### Task 2: Перевод «поля блока ↔ углы суставов»

**Files:**
- Create: `components/simulator/teach-pose.ts`
- Test: `components/simulator/teach-pose.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `components/simulator/teach-pose.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { flangePose, parseUrdfChain, type KinematicChain } from '@prompower/sim-core';
import { BLOCK_TYPES } from '@prompower/blocks';
import { fieldsFromJoints, seedJoints, teachKindOf } from './teach-pose';

/** Шестиосевая рука тех же пропорций, что в тестах кинематики ядра. */
const ARM = `<robot name="six_axis">
  <link name="base"/>
  <joint name="j1" type="revolute">
    <parent link="base"/><child link="l1"/>
    <origin xyz="0 0 0.15"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l1"/>
  <joint name="j2" type="revolute">
    <parent link="l1"/><child link="l2"/>
    <origin xyz="0 0 0.1"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0"/>
  </joint>
  <link name="l2"/>
  <joint name="j3" type="revolute">
    <parent link="l2"/><child link="l3"/>
    <origin xyz="0 0 0.36"/><axis xyz="0 1 0"/>
    <limit lower="-2.6" upper="2.6"/>
  </joint>
  <link name="l3"/>
  <joint name="j4" type="revolute">
    <parent link="l3"/><child link="l4"/>
    <origin xyz="0 0 0.3"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l4"/>
  <joint name="j5" type="revolute">
    <parent link="l4"/><child link="l5"/>
    <origin xyz="0 0 0.09"/><axis xyz="0 1 0"/>
    <limit lower="-2.0" upper="2.0"/>
  </joint>
  <link name="l5"/>
  <joint name="j6" type="revolute">
    <parent link="l5"/><child link="l6"/>
    <origin xyz="0 0 0.08"/><axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14"/>
  </joint>
  <link name="l6"/>
</robot>`;

const CHAIN: KinematicChain = parseUrdfChain(ARM, ['j1', 'j2', 'j3', 'j4', 'j5', 'j6']);
const REST = [0, 0.3, -0.6, 0, 0.3, 0];

describe('какой блок чему учится', () => {
  it('различает движение по осям и по прямой', () => {
    expect(teachKindOf(BLOCK_TYPES.moveJoint)).toBe('joints');
    expect(teachKindOf(BLOCK_TYPES.moveLinear)).toBe('pose');
    expect(teachKindOf(BLOCK_TYPES.gripper)).toBeNull();
  });
});

describe('поля блока в позу копии', () => {
  it('движение по осям берёт углы прямо из полей', () => {
    const seed = seedJoints('joints', { J1: 90, J2: 0, J3: -45, J4: 0, J5: 0, J6: 180 }, CHAIN, REST);

    expect(seed.exact).toBe(true);
    expect(seed.joints[0]).toBeCloseTo(Math.PI / 2, 9);
    expect(seed.joints[2]).toBeCloseTo(-Math.PI / 4, 9);
  });

  it('углы за пределом сустава зажимаются пределом из URDF', () => {
    const seed = seedJoints('joints', { J1: 0, J2: 180, J3: 0, J4: 0, J5: 0, J6: 0 }, CHAIN, REST);

    expect(seed.joints[1]).toBeCloseTo(2.0, 9);
  });

  it('движение по прямой решает обратную задачу от записанной точки', () => {
    const target = flangePose(CHAIN, REST);
    const fields = fieldsFromJoints('pose', REST, CHAIN);

    const seed = seedJoints('pose', fields, CHAIN, [0, 0, 0, 0, 0, 0]);

    expect(seed.exact).toBe(true);
    const reached = flangePose(CHAIN, seed.joints);
    expect(reached.x).toBeCloseTo(target.x, 3);
    expect(reached.y).toBeCloseTo(target.y, 3);
    expect(reached.z).toBeCloseTo(target.z, 3);
  });

  it('недостижимая точка не ломает обучение, а начинается с текущей позы', () => {
    const seed = seedJoints('pose', { X: 5000, Y: 0, Z: 0, RX: 180, RY: 0, RZ: 0 }, CHAIN, REST);

    expect(seed.exact).toBe(false);
    expect([...seed.joints]).toEqual(REST);
  });
});

describe('поза копии в поля блока', () => {
  it('движение по осям пишет градусы с десятыми', () => {
    const fields = fieldsFromJoints('joints', [Math.PI / 2, 0, -Math.PI / 4, 0, 0, 0], CHAIN);

    expect(fields).toEqual({ J1: 90, J2: 0, J3: -45, J4: 0, J5: 0, J6: 0 });
  });

  it('движение по прямой пишет миллиметры и градусы фланца', () => {
    const pose = flangePose(CHAIN, REST);
    const fields = fieldsFromJoints('pose', REST, CHAIN);

    expect(fields.X).toBe(Math.round(pose.x * 1000));
    expect(fields.Z).toBe(Math.round(pose.z * 1000));
    expect(fields.RY).toBeCloseTo((pose.ry * 180) / Math.PI, 1);
  });

  it('минус нуля в полях не бывает', () => {
    const fields = fieldsFromJoints('joints', [-1e-9, 0, 0, 0, 0, 0], CHAIN);

    expect(Object.is(fields.J1, -0)).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- teach-pose`
Expected: FAIL, `Failed to resolve import "./teach-pose"`.

- [ ] **Step 3: Написать модуль**

Создать `components/simulator/teach-pose.ts`:

```typescript
import {
  clampJointVector,
  flangePose,
  jointLimits,
  solveIk,
  type KinematicChain,
  type Pose,
} from '@prompower/sim-core';
import { BLOCK_TYPES } from '@prompower/blocks';

/**
 * Перевод между полями блока движения и углами суставов серой копии.
 *
 * Поля блока — градусы и миллиметры, как на планшете JAKA; углы — радианы, как
 * в URDF. Модуль чистый: ни Blockly, ни three.js, поэтому проверяется в CI без
 * браузера, как и остальная кинематика.
 */

/** Чему учится блок: своим углам или позе фланца. */
export type TeachKind = 'joints' | 'pose';

export type TeachFields = Readonly<Record<string, number>>;

export interface Seed {
  readonly joints: readonly number[];
  /**
   * Удалось ли встать ровно в записанную точку. Ложь означает, что обратная
   * задача решения не нашла и копия поднялась в запасной позе.
   */
  readonly exact: boolean;
}

const JOINT_FIELDS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MM = 1000;

export function teachKindOf(blockType: string): TeachKind | null {
  if (blockType === BLOCK_TYPES.moveJoint) return 'joints';
  if (blockType === BLOCK_TYPES.moveLinear) return 'pose';
  return null;
}

/** Поза, в которой копия поднимается при входе в обучение. */
export function seedJoints(
  kind: TeachKind,
  fields: TeachFields,
  chain: KinematicChain,
  fallback: readonly number[],
): Seed {
  const limits = jointLimits(chain);

  if (kind === 'joints') {
    const raw = JOINT_FIELDS.map((name) => (fields[name] ?? 0) * DEG_TO_RAD);
    return { joints: clampJointVector(limits, raw), exact: true };
  }

  const solved = solveIk(chain, poseFromFields(fields), fallback);
  if (!solved.ok) return { joints: [...fallback], exact: false };

  return { joints: clampJointVector(limits, [...solved.joints]), exact: true };
}

/** Значения полей блока для позы копии. */
export function fieldsFromJoints(
  kind: TeachKind,
  joints: readonly number[],
  chain: KinematicChain,
): TeachFields {
  if (kind === 'joints') {
    return Object.fromEntries(
      JOINT_FIELDS.map((name, index) => [name, degrees(joints[index] ?? 0)]),
    );
  }

  const pose = flangePose(chain, joints);
  return {
    X: millimetres(pose.x),
    Y: millimetres(pose.y),
    Z: millimetres(pose.z),
    RX: degrees(pose.rx),
    RY: degrees(pose.ry),
    RZ: degrees(pose.rz),
  };
}

function poseFromFields(fields: TeachFields): Pose {
  return {
    x: (fields.X ?? 0) / MM,
    y: (fields.Y ?? 0) / MM,
    z: (fields.Z ?? 0) / MM,
    rx: (fields.RX ?? 0) * DEG_TO_RAD,
    ry: (fields.RY ?? 0) * DEG_TO_RAD,
    rz: (fields.RZ ?? 0) * DEG_TO_RAD,
  };
}

/** Точность полей блока: десятые градуса и целые миллиметры. */
function degrees(radians: number): number {
  return zero(Math.round(radians * RAD_TO_DEG * 10) / 10);
}

function millimetres(metres: number): number {
  return zero(Math.round(metres * MM));
}

/** Минус нуль в поле блока смотрится опечаткой. */
function zero(value: number): number {
  return value === 0 ? 0 : value;
}
```

- [ ] **Step 4: Прогнать тест**

Run: `npm test -- teach-pose`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add components/simulator/teach-pose.ts components/simulator/teach-pose.test.ts
git commit -m "feat: перевод между полями блока движения и углами суставов"
```

---

### Task 3: Кнопка в блоке и связь с редактором

**Files:**
- Create: `components/simulator/teach-field.ts`
- Modify: `components/simulator/block-editor.tsx`
- Modify: `components/simulator/program-panel.tsx`

Unit-теста здесь нет намеренно: всё содержимое — склейка с Blockly, она проверяется e2e-тестом в Task 6. Чистая часть уже покрыта в Task 2.

- [ ] **Step 1: Написать поле-кнопку**

Создать `components/simulator/teach-field.ts`:

```typescript
'use client';

import * as Blockly from 'blockly';
import { TEACH_EXTENSION, TEACH_LABEL } from '@prompower/blocks';

/**
 * Кнопка «показать роботу» внутри блока движения.
 *
 * Blockly не знает ни про сцену, ни про React, поэтому нажатие уезжает наружу
 * обычным событием DOM на холсте редактора. Связь односторонняя: редактор
 * сообщает «этот блок просят показать», а что делать дальше — дело экрана урока.
 */

export const TEACH_EVENT = 'pp-teach';

export interface TeachEventDetail {
  readonly blockId: string;
}

/** Класс на поле нужен тесту: искать по русскому тексту внутри SVG хрупко. */
const FIELD_CLASS = 'ppTeachField';

class TeachField extends Blockly.Field<string> {
  override EDITABLE = true;
  override SERIALIZABLE = false;

  constructor() {
    super(TEACH_LABEL);
  }

  protected override initView(): void {
    super.initView();
    const root = this.getSvgRoot();
    if (root !== null) Blockly.utils.dom.addClass(root, FIELD_CLASS);
  }

  protected override showEditor_(): void {
    const block = this.getSourceBlock();
    if (block === null) return;

    const workspace = block.workspace;
    if (!(workspace instanceof Blockly.WorkspaceSvg)) return;

    workspace.getInjectionDiv().dispatchEvent(
      new CustomEvent<TeachEventDetail>(TEACH_EVENT, {
        detail: { blockId: block.id },
        bubbles: true,
      }),
    );
  }
}

let registered = false;

/** Расширение регистрируется до определения блоков: иначе Blockly их отвергнет. */
export function registerTeachExtension(): void {
  if (registered) return;
  Blockly.Extensions.register(TEACH_EXTENSION, function (this: Blockly.Block) {
    this.appendDummyInput('TEACH').appendField(new TeachField());
  });
  registered = true;
}
```

Если `Blockly.Field` в строгом режиме потребует абстрактных членов или поле не отзовётся на нажатие — запасной вариант, документированный у Blockly: картинка с обработчиком. Тогда класс `TeachField` целиком заменяется на константу

```typescript
const ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="white" stroke-width="1.6"><circle cx="10" cy="10" r="6"/><path d="M10 1v4M10 15v4M1 10h4M15 10h4"/></svg>',
  );
```

а тело расширения — на

```typescript
    this.appendDummyInput('TEACH')
      .appendField(TEACH_LABEL)
      .appendField(
        new Blockly.FieldImage(ICON, 18, 18, TEACH_LABEL, () => {
          const workspace = this.workspace;
          if (!(workspace instanceof Blockly.WorkspaceSvg)) return;
          workspace.getInjectionDiv().dispatchEvent(
            new CustomEvent<TeachEventDetail>(TEACH_EVENT, {
              detail: { blockId: this.id },
              bubbles: true,
            }),
          );
        }),
      );
```

и в тесте Task 6 селектор `.ppTeachField` меняется на `.blocklyEditableField image`.

- [ ] **Step 2: Научить редактор отдавать запрос и записывать поля**

В `components/simulator/block-editor.tsx` дополнить импорты:

```typescript
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { registerTeachExtension, TEACH_EVENT, type TeachEventDetail } from './teach-field';
```

Заменить `registerBlocks`:

```typescript
/** Определения блоков глобальны для Blockly: регистрируем ровно один раз. */
function registerBlocks(): void {
  if (registered) return;
  // Расширение обязано быть известно раньше блоков, которые на него ссылаются.
  registerTeachExtension();
  Blockly.defineBlocksWithJsonArray([...BLOCK_DEFINITIONS] as never[]);
  registered = true;
}
```

Перед объявлением компонента добавить типы:

```typescript
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
```

Сигнатуру и начало компонента заменить на:

```typescript
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

  useImperativeHandle(ref, () => ({
    writeFields(blockId, fields) {
      const block = workspaceRef.current?.getBlockById(blockId);
      if (block === undefined || block === null) return;
      for (const [name, value] of Object.entries(fields)) {
        if (block.getField(name) === null) continue;
        block.setFieldValue(value, name);
      }
    },
  }), []);
```

Внутри существующего `useEffect`, сразу после `Blockly.inject(...)`, добавить:

```typescript
    workspaceRef.current = workspace;

    const onTeachEvent = (event: Event): void => {
      const detail = (event as CustomEvent<TeachEventDetail>).detail;
      const block = workspace.getBlockById(detail.blockId);
      if (block === null) return;
      teach.current({ blockId: block.id, blockType: block.type, fields: numericFields(block) });
    };
    container.addEventListener(TEACH_EVENT, onTeachEvent);
```

а в функцию очистки эффекта, перед `workspace.dispose()`:

```typescript
      container.removeEventListener(TEACH_EVENT, onTeachEvent);
      workspaceRef.current = null;
```

В конец файла добавить:

```typescript
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
```

- [ ] **Step 3: Пробросить через панель программы**

В `components/simulator/program-panel.tsx` заменить импорт редактора на:

```typescript
import type { Ref } from 'react';
import { BlockEditor, type BlockEditorHandle, type TeachRequest } from './block-editor';
```

в пропсы добавить два поля:

```typescript
  onTeach,
  editorRef,
}: {
  program: Program;
  starter: object;
  /** Исполняемая сейчас инструкция — подсвечивается в списке. */
  current: Statement | null;
  error: string | null;
  onProgram: (program: Program, error: string | null) => void;
  onTeach: (request: TeachRequest) => void;
  editorRef: Ref<BlockEditorHandle>;
}) {
```

и передать их редактору:

```typescript
        <BlockEditor initial={starter} onChange={onProgram} onTeach={onTeach} ref={editorRef} />
```

- [ ] **Step 4: Проверить типы**

Run: `npm run typecheck`
Expected: ошибка только в `lesson-workspace.tsx` — там ещё не переданы новые пропсы. Закрывается следующей задачей.

- [ ] **Step 5: Коммит**

```bash
git add components/simulator/teach-field.ts components/simulator/block-editor.tsx components/simulator/program-panel.tsx
git commit -m "feat: кнопка показа точки в блоке движения и запись полей обратно"
```

---

### Task 4: Серая копия робота в сцене

**Files:**
- Create: `components/simulator/ghost-robot.tsx`

- [ ] **Step 1: Написать компонент**

Создать `components/simulator/ghost-robot.tsx`:

```typescript
'use client';

import { useEffect, useMemo } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import type { URDFRobot } from 'urdf-loader';

/**
 * Серая копия робота: поза, которую показывают, а не исполняют.
 *
 * Копия — клон загруженной модели, а значит делит с оригиналом геометрию;
 * освобождать её нельзя, иначе исчезнет настоящий робот. Свой у копии только
 * материал, и он один на всех: заводить по материалу на меш незачем.
 */

const GHOST_MATERIAL = new MeshStandardMaterial({
  color: '#9aa4b5',
  transparent: true,
  opacity: 0.4,
  // Без этого прозрачные звенья закрывают друг друга и копия выглядит рваной.
  depthWrite: false,
  roughness: 0.9,
  metalness: 0,
});

export function GhostRobot({
  source,
  jointNames,
  values,
}: {
  source: URDFRobot;
  /** Имена суставов в том же порядке, что и `values`. */
  jointNames: readonly string[];
  /** Углы в радианах, уже зажатые в пределы. */
  values: readonly number[];
}) {
  const ghost = useMemo(() => {
    const clone = source.clone(true) as URDFRobot;

    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.material = GHOST_MATERIAL;
      object.castShadow = false;
      object.receiveShadow = false;
    });

    // Прозрачное рисуется после непрозрачного, иначе копия пропадает за роботом.
    clone.renderOrder = 1;
    return clone;
  }, [source]);

  useEffect(() => {
    jointNames.forEach((name, index) => {
      ghost.setJointValue(name, values[index] ?? 0);
    });
  }, [ghost, jointNames, values]);

  return <primitive object={ghost} />;
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: ошибка остаётся только в `lesson-workspace.tsx` (пропсы из Task 3).

- [ ] **Step 3: Коммит**

```bash
git add components/simulator/ghost-robot.tsx
git commit -m "feat: серая копия робота для показа позы"
```

Клон проверяется вживую в Task 5, шаг 5, и тестом в Task 6: если `clone()` в `urdf-loader` не сохранит карту суставов, копия встанет в нулевую позу и не отзовётся на ползунки. Запасной путь — поднять вторую модель тем же хуком `useUrdfRobot(plugin)`: URDF и меши придут из кэша браузера.

---

### Task 5: Панель обучения на экране урока

**Files:**
- Create: `components/simulator/teach-panel.tsx`
- Modify: `components/simulator/lesson-workspace.tsx`
- Modify: `messages/ru.json`, `messages/en.json`

- [ ] **Step 1: Добавить подписи**

В `messages/ru.json` внутрь блока `"lesson"` добавить:

```json
    "teach": {
      "title": "Показать роботу точку",
      "hintJoints": "Двигайте ползунки — серая копия покажет, куда приедет робот.",
      "hintPose": "Записанная точка недостижима, копия стоит в текущей позе робота.",
      "flange": "Фланец",
      "save": "Сохранить",
      "cancel": "Отмена"
    },
```

То же место в `messages/en.json`:

```json
    "teach": {
      "title": "Teach the robot a point",
      "hintJoints": "Drag the sliders — the grey copy shows where the robot will go.",
      "hintPose": "The stored point is out of reach, the copy starts from the current pose.",
      "flange": "Flange",
      "save": "Save",
      "cancel": "Cancel"
    },
```

- [ ] **Step 2: Написать панель**

Создать `components/simulator/teach-panel.tsx`:

```typescript
'use client';

import { useTranslations } from 'next-intl';
import {
  flangePose,
  type JointDescriptor,
  type JointLimit,
  type KinematicChain,
} from '@prompower/sim-core';
import { JointPanel } from './joint-panel';

/**
 * Панель показа точки: то же ручное управление, что на планшете JAKA, только
 * двигает оно серую копию, а не робота.
 */

const MM = 1000;

export function TeachPanel({
  joints,
  limits,
  chain,
  values,
  exact,
  onChange,
  onSave,
  onCancel,
}: {
  joints: readonly JointDescriptor[];
  limits: readonly JointLimit[];
  chain: KinematicChain;
  values: readonly number[];
  /** Ложь — записанную точку взять не удалось, об этом надо сказать. */
  exact: boolean;
  onChange: (index: number, radians: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('lesson');
  const pose = flangePose(chain, values);

  return (
    <section data-testid="teach-panel" className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium">{t('teach.title')}</h2>
        <p className="mt-1 text-sm text-ink-dim">
          {exact ? t('teach.hintJoints') : t('teach.hintPose')}
        </p>
      </div>

      <p data-testid="teach-flange" className="font-mono text-xs tabular-nums text-ink-faint">
        {t('teach.flange')} X {Math.round(pose.x * MM)} Y {Math.round(pose.y * MM)} Z{' '}
        {Math.round(pose.z * MM)}
      </p>

      <JointPanel joints={joints} limits={limits} values={values} onChange={onChange} />

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="teach-save"
          onClick={onSave}
          className="rounded-panel bg-brand px-3 py-1.5 text-sm text-surface-0"
        >
          {t('teach.save')}
        </button>
        <button
          type="button"
          data-testid="teach-cancel"
          onClick={onCancel}
          className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
        >
          {t('teach.cancel')}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Связать всё на экране урока**

В `components/simulator/lesson-workspace.tsx` дополнить импорты:

```typescript
import { useCallback, useMemo, useRef, useState } from 'react';
import type { BlockEditorHandle, TeachRequest } from './block-editor';
import { GhostRobot } from './ghost-robot';
import { TeachPanel } from './teach-panel';
import { fieldsFromJoints, seedJoints, teachKindOf, type TeachKind } from './teach-pose';
```

Рядом с типами `Loaded` и `Chain` добавить:

```typescript
interface Teaching {
  readonly blockId: string;
  readonly kind: TeachKind;
  readonly joints: readonly number[];
  readonly exact: boolean;
}
```

Внутри компонента `Workspace`, после объявления `runner`, добавить:

```typescript
  const editor = useRef<BlockEditorHandle>(null);
  const [teaching, setTeaching] = useState<Teaching | null>(null);

  const startTeaching = useCallback(
    (request: TeachRequest) => {
      const kind = teachKindOf(request.blockType);
      if (kind === null) return;

      // Показывать точку на ходу нельзя: копия и робот разъедутся на глазах.
      runner.pause();

      const seed = seedJoints(kind, request.fields, chain, runner.joints);
      setTeaching({ blockId: request.blockId, kind, joints: seed.joints, exact: seed.exact });
    },
    [chain, runner],
  );

  const saveTeaching = useCallback(() => {
    if (teaching === null) return;
    editor.current?.writeFields(
      teaching.blockId,
      fieldsFromJoints(teaching.kind, teaching.joints, chain),
    );
    setTeaching(null);
  }, [teaching, chain]);

  const moveTeaching = useCallback((index: number, radians: number) => {
    setTeaching((current) =>
      current === null
        ? null
        : { ...current, joints: current.joints.map((value, i) => (i === index ? radians : value)) },
    );
  }, []);
```

Содержимое левой колонки `<aside>` заменить на выбор:

```typescript
          {teaching === null ? (
            <>
              <section>
                <h2 className="mb-2 text-sm font-medium">{t('goals')}</h2>
                <ul className="flex flex-col gap-1 text-sm text-ink-dim">
                  {task.goals.map((goal, index) => (
                    <li key={index}>
                      {goal.type === 'objectInZone'
                        ? t('goal.objectInZone', { object: goal.object, zone: goal.zone })
                        : t('goal.gripperState', { state: t(`gripper.${goal.state}`) })}
                    </li>
                  ))}
                </ul>
              </section>

              <Verdict runner={runner} t={t} />
            </>
          ) : (
            <TeachPanel
              joints={plugin.joints}
              limits={model.limits}
              chain={chain}
              values={teaching.joints}
              exact={teaching.exact}
              onChange={moveTeaching}
              onSave={saveTeaching}
              onCancel={() => setTeaching(null)}
            />
          )}
```

Вызов `ProgramPanel` дополнить двумя пропсами:

```typescript
            onTeach={startTeaching}
            editorRef={editor}
```

Внутрь `RobotViewer`, следом за `<SceneObjects …/>`, добавить копию:

```typescript
            {teaching !== null && (
              <GhostRobot
                source={model.robot}
                jointNames={plugin.joints.map((joint) => joint.urdfName)}
                values={teaching.joints}
              />
            )}
```

- [ ] **Step 4: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: обе команды зелёные.

- [ ] **Step 5: Посмотреть глазами**

Run: `npm run dev`, открыть `http://localhost:3000/ru/lesson/instrument-i-zahvat`, нажать «показать роботу» на блоке «двигаться по осям».
Expected: слева ползунки, в сцене серая копия в позе блока; ползунок двигает только копию; «Сохранить» меняет числа в блоке; «Отмена» — нет.

- [ ] **Step 6: Коммит**

```bash
git add components/simulator messages
git commit -m "feat: показ точки роботу прямо на экране урока"
```

---

### Task 6: Сценарий обучения в e2e

**Files:**
- Modify: `tests/e2e/lesson.spec.ts`

- [ ] **Step 1: Написать тесты**

В конец `tests/e2e/lesson.spec.ts` добавить:

```typescript
/**
 * Показ точки роботу. Проверяется вся цепочка: кнопка в блоке → панель и серая
 * копия → ползунок → запись в блок → новая программа в списке.
 */
const FIRST_MOVE_LINE = 1;

test('кнопка в блоке движения открывает показ точки', async ({ page }) => {
  await page.locator('.ppTeachField').first().click();

  await expect(page.getByTestId('teach-panel')).toBeVisible();
  await expect(page.getByTestId('teach-flange')).toContainText('Фланец');
  await expect(page.locator('[data-testid="teach-panel"] input[type="range"]')).toHaveCount(6);
});

test('сохранение пишет показанную позу в блок', async ({ page }) => {
  await page.getByTestId('tab-list').click();
  await expect(page.getByTestId('program-line').nth(FIRST_MOVE_LINE)).toContainText('По осям 13°');

  await page.getByTestId('tab-blocks').click();
  await page.locator('.ppTeachField').first().click();
  await page.locator('[data-testid="teach-panel"] input[type="range"]').first().fill('45');
  await page.getByTestId('teach-save').click();

  await expect(page.getByTestId('teach-panel')).toHaveCount(0);
  await page.getByTestId('tab-list').click();
  await expect(page.getByTestId('program-line').nth(FIRST_MOVE_LINE)).toContainText('По осям 45°');
});

test('отмена не меняет программу', async ({ page }) => {
  await page.locator('.ppTeachField').first().click();
  await page.locator('[data-testid="teach-panel"] input[type="range"]').first().fill('45');
  await page.getByTestId('teach-cancel').click();

  await expect(page.getByTestId('teach-panel')).toHaveCount(0);
  await page.getByTestId('tab-list').click();
  await expect(page.getByTestId('program-line').nth(FIRST_MOVE_LINE)).toContainText('По осям 13°');
});

test('показ точки останавливает прогон', async ({ page }) => {
  await page.getByTestId('play').click();
  await page.locator('.ppTeachField').first().click();

  await expect(page.getByTestId('teach-panel')).toBeVisible();
  await expect(page.getByTestId('verdict')).toHaveCount(0);
});
```

- [ ] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/lesson.spec.ts`
Expected: PASS, все тесты файла.

Если падает первый тест — `.first()` попал не в тот блок движения: в стартовой программе их пять. Тогда выбирать блок по соседнему числу:
`page.locator('.blocklyDraggable', { hasText: '88.3' }).locator('.ppTeachField')`.

Если панель работает, а `По осям 45°` не появилось — смотреть, дошли ли поля до блока: вкладка «Код» должна показать новый первый аргумент `joint_move`.

- [ ] **Step 3: Коммит**

```bash
git add tests/e2e/lesson.spec.ts
git commit -m "test: сквозной сценарий показа точки роботу"
```

---

### Task 7: Проверка целиком

**Files:** нет

- [ ] **Step 1: Типы**

Run: `npm run typecheck`
Expected: без вывода.

- [ ] **Step 2: Unit**

Run: `npm test`
Expected: PASS, не меньше прежних 327 тестов плюс новые.

- [ ] **Step 3: E2E**

Run: `npx playwright test`
Expected: PASS, включая прежние 17.

- [ ] **Step 4: Задание проходится с показанной точкой**

Открыть урок, показать роботу точку в первом блоке «двигаться по осям» так, чтобы фланец встал над деталью, запустить программу.
Expected: вердикт «Задание выполнено» либо внятное объяснение, чего не хватило, — но не ошибка исполнения.

- [ ] **Step 5: Закрыть ветку**

Использовать `superpowers:finishing-a-development-branch`.
