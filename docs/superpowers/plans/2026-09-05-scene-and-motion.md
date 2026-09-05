# Облик сцены и движение робота — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** сделать сцену похожей на настоящую ячейку — отражения, контактная тень, три источника света — и заставить робота ехать между позами, а кнопки подвода работать удержанием, как на промышленном пульте.

**Architecture:** освещение уезжает в отдельный компонент на процедурной среде из drei, без скачивания HDRI. Движение делится надвое: чистая арифметика длительности и интерполяции в тестируемом модуле рядом с `joint-display.ts`, циклы `requestAnimationFrame` и повтора — в двух хуках. Удержание не заводит нового пути в обратную задачу: оно повторяет тот же одиночный шаг восемь раз в секунду, а хук анимации сглаживает эти шаги в непрерывное движение.

**Tech Stack:** three 0.185, @react-three/fiber 9.7, @react-three/drei 10.7, Vitest (окружение `node`), Playwright.

Спека: [../specs/2026-09-05-scene-and-motion-design.md](../specs/2026-09-05-scene-and-motion-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `components/simulator/scene-lighting.tsx` | новый: среда, три источника, контактная тень |
| `components/simulator/robot-viewer.tsx` | изменяется: освещение наружу, границы теней от габарита, стальная столешница, виньетка |
| `components/simulator/joint-motion.ts` | новый: длительность движения, интерполяция, сглаживание |
| `components/simulator/joint-motion.test.ts` | новый: тесты арифметики |
| `components/simulator/use-animated-joints.ts` | новый: цикл rAF, ведущий показываемую позу к целевой |
| `components/simulator/use-hold-jog.ts` | новый: короткое нажатие против удержания |
| `components/simulator/cartesian-panel.tsx` | изменяется: круглые кнопки с удержанием |
| `components/simulator/lesson-workspace.tsx` | изменяется: анимированная копия, жог возвращает исход |
| `tests/e2e/lesson.spec.ts` | изменяется: удержание и остановка |

Проверено по коду перед написанием плана:

- В сцене установлены только `Grid` и `OrbitControls` из drei; `Environment`, `Lightformer` и `ContactShadows` есть в 10.7.8 и новых зависимостей не требуют.
- Поверхность столешницы лежит на нуле по Y (комментарий у `WorkTable`), робот повёрнут `rotation.x = -Math.PI / 2`.
- `RobotBounds` даёт `radius`, `liftY`, `centerY`; дистанция камеры уже считается от `radius`.
- Vitest работает в окружении `node`, поэтому хуки с DOM тестируются не unit-тестами, а сквозными.
- Числовые поля панели **неуправляемые**, с `key` от показанного значения. Поэтому показания остаются на логической позе: перемонтировать поле ввода шестьдесят раз в секунду значило бы сделать его непечатаемым.

---

# Этап 1. Облик сцены

## Task 1: Освещение отдельным компонентом

**Files:**
- Create: `components/simulator/scene-lighting.tsx`

- [ ] **Step 1: Написать компонент**

Создать `components/simulator/scene-lighting.tsx`:

```tsx
'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';

/**
 * Освещение сцены: студийная среда, три источника и контактная тень.
 *
 * Среда собирается из прямоугольных источников прямо здесь, а не скачивается
 * готовой картой: бриф требует загрузки сцены меньше чем за две секунды и не
 * разрешает зависеть от чужой сети. `frames={1}` рендерит её в кубическую карту
 * один раз — источники неподвижны, пересчитывать каждый кадр нечего.
 *
 * Без среды металлу нечего отражать, и настоящая модель читается как серый
 * пластик. Это главное, что делает сцену живой.
 */

export function SceneLighting({ radius }: { radius: number }) {
  const distance = radius * 3;
  // Тень рисует только ключевой источник, и её камера должна охватывать робота
  // целиком с запасом на вылет руки — но не больше, иначе разрешение карты
  // уходит впустую и тень становится мылом.
  const shadowExtent = radius * 1.6;

  return (
    <>
      <Environment resolution={256} frames={1}>
        {/* Верхний мягкий: основной блик по кромкам звеньев. */}
        <Lightformer
          form="rect"
          intensity={2.2}
          position={[0, 5, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[10, 10, 1]}
          color="#ffffff"
        />
        {/* Боковые холодный и тёплый: без разницы температур металл плоский. */}
        <Lightformer
          form="rect"
          intensity={1.4}
          position={[-5, 1, 2]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[8, 6, 1]}
          color="#9fc4ff"
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          position={[5, 1, -2]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[8, 6, 1]}
          color="#ffd9a8"
        />
      </Environment>

      {/* Заливка приглушена: раньше она несла весь свет, теперь его даёт среда. */}
      <hemisphereLight args={['#8a93a5', '#1a1d22', 0.35]} />

      <directionalLight
        position={[distance, distance * 1.4, distance * 0.6]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-far={distance * 4}
        shadow-bias={-0.0008}
      />

      {/* Контровой: отделяет силуэт от фона, тени не даёт. */}
      <directionalLight
        position={[-distance * 0.8, distance * 0.6, -distance]}
        intensity={0.6}
        color="#b8d4ff"
      />

      {/*
        Контакт со столешницей. Направленная тень одна не даёт ощущения, что
        робот стоит: он выглядит висящим над столом. Поверхность стола на нуле
        по Y, поэтому пятно кладём чуть выше, чтобы не спорить с ней за пиксели.
      */}
      <ContactShadows
        position={[0, 0.001, 0]}
        scale={radius * 3}
        resolution={512}
        blur={2.4}
        opacity={0.55}
        far={radius}
      />
    </>
  );
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

- [ ] **Step 3: Коммит**

```bash
git add components/simulator/scene-lighting.tsx
git commit -m "feat: студийное освещение и контактная тень в сцене"
```

---

## Task 2: Подключить освещение и поправить сцену

**Files:**
- Modify: `components/simulator/robot-viewer.tsx`

- [ ] **Step 1: Заменить блок освещения**

В `components/simulator/robot-viewer.tsx` добавить импорт рядом с остальными:

```tsx
import { SceneLighting } from './scene-lighting';
```

Удалить из разметки `<hemisphereLight>` и `<directionalLight>` целиком (весь блок от `<hemisphereLight args={['#8a93a5', '#1a1d22', 0.7]} />` до закрывающего `/>` направленного источника вместе с четырьмя строками `shadow-camera-*`) и поставить на их место:

```tsx
<SceneLighting radius={bounds.radius} />
```

Именно здесь уходят зашитые `shadow-camera-left={-2}` и три такие же константы: границы теперь считаются от габарита модели, как того требует правило «не хардкодь ни одной характеристики робота».

- [ ] **Step 2: Сделать столешницу стальной**

В том же файле заменить материал столешницы в `WorkTable`:

```tsx
<meshStandardMaterial color={TABLE_TOP} roughness={0.28} metalness={0.65} />
```

Было `roughness={0.85} metalness={0.05}` — матовый пластик. Индустриальный стол стальной, и теперь, когда есть среда, в столешнице появляется отражение робота.

- [ ] **Step 3: Охладить фон**

В том же файле заменить константу:

```tsx
const SURFACE = '#101319';
```

Было `#14161a`. Чуть темнее и заметно холоднее: серый робот на нейтрально-сером фоне сливается, на синеватом — отделяется.

- [ ] **Step 4: Добавить виньетку**

Виньетка делается наложением поверх холста, а не в сцене: шейдер ради неё писать незачем, а пакет постобработки мы не подключаем.

В `components/simulator/lesson-workspace.tsx` внутри `<main className="relative ...">`, сразу после закрывающего тега `</RobotViewer>` и перед блоком со счётчиком кадров, добавить:

```tsx
{/* Виньетка: сцена перестаёт выглядеть вырезанной в пустоте. */}
<div
  aria-hidden
  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,transparent_45%,rgba(0,0,0,0.5)_100%)]"
/>
```

- [ ] **Step 5: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: typecheck без вывода, тесты PASS.

- [ ] **Step 6: Коммит**

```bash
git add components/simulator/robot-viewer.tsx components/simulator/lesson-workspace.tsx
git commit -m "feat: границы теней от габарита робота, стальная столешница, виньетка"
```

---

## Task 3: Замерить кадры

**Files:** нет

- [ ] **Step 1: Поднять сервер**

Run: `npm run dev`

- [ ] **Step 2: Посмотреть счётчик**

Открыть `http://127.0.0.1:3000/ru/lesson/instrument-i-zahvat`, найти показание в правом нижнем углу сцены (`data-testid="scene-stats"`), покрутить камеру полминуты.

Ожидание: не ниже 60 fps, загрузка модели меньше 2000 мс.

Если ниже — откручивать в таком порядке, перепроверяя после каждого шага:
1. `resolution` контактной тени с 512 до 256;
2. убрать тёплый боковой лайтформер;
3. убрать `<ContactShadows>` целиком.

Отражения в столешнице трогать последними: они дают больше всего на единицу затрат.

- [ ] **Step 3: Прогнать сквозные тесты сцены**

Run: `npx playwright test tests/e2e/sandbox.spec.ts`
Expected: PASS, 8 тестов, включая «кадры идут» и «модель грузится быстрее двух секунд».

---

# Этап 2. Движение

## Task 4: Арифметика движения

**Files:**
- Create: `components/simulator/joint-motion.ts`
- Create: `components/simulator/joint-motion.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Создать `components/simulator/joint-motion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  easeInOut,
  interpolateJoints,
  motionDuration,
} from './joint-motion';

const HOME = [0, 0.4, -0.8, 0, 0.4, 0];

describe('motionDuration', () => {
  it('большое движение длится дольше малого', () => {
    const small = motionDuration(HOME, [0, 0.41, -0.8, 0, 0.4, 0]);
    const large = motionDuration(HOME, [0, 0.4 + Math.PI, -0.8, 0, 0.4, 0]);

    expect(large).toBeGreaterThan(small);
  });

  it('считает по самому подвижному суставу, а не по сумме', () => {
    // Один сустав на 0.5 рад против шести по 0.5 рад: рука едет одновременно,
    // поэтому длительность одинаковая.
    const one = motionDuration(HOME, HOME.map((v, i) => (i === 1 ? v + 0.5 : v)));
    const all = motionDuration(HOME, HOME.map((v) => v + 0.5));

    expect(all).toBeCloseTo(one, 5);
  });

  it('не короче нижней границы и не длиннее верхней', () => {
    expect(motionDuration(HOME, HOME)).toBe(MIN_DURATION_MS);
    expect(motionDuration(HOME, HOME.map((v) => v + 100))).toBe(MAX_DURATION_MS);
  });
});

describe('interpolateJoints', () => {
  it('в начале даёт исходную позу, в конце целевую', () => {
    const to = [0.1, 0.5, -0.7, 0.2, 0.3, 0.4];

    expect(interpolateJoints(HOME, to, 0)).toEqual(HOME);
    expect(interpolateJoints(HOME, to, 1)).toEqual(to);
  });

  it('на половине пути даёт середину', () => {
    const result = interpolateJoints([0, 0, 0, 0, 0, 0], [1, 2, 3, 4, 5, 6], 0.5);

    expect(result).toEqual([0.5, 1, 1.5, 2, 2.5, 3]);
  });

  it('короткий вектор целевой позы не роняет вычисление', () => {
    // Смена модели робота меняет число суставов: пока новая поза не доехала,
    // векторы разной длины встречаются на один кадр.
    expect(interpolateJoints([0, 1, 2], [4], 0.5)).toEqual([2, 0.5, 1]);
  });
});

describe('easeInOut', () => {
  it('закреплён на концах и в середине', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  });

  it('монотонно растёт', () => {
    const points = [0, 0.2, 0.4, 0.6, 0.8, 1].map(easeInOut);

    for (let i = 1; i < points.length; i += 1) {
      expect(points[i] ?? 0).toBeGreaterThan(points[i - 1] ?? 0);
    }
  });

  it('в начале и в конце медленнее, чем в середине', () => {
    // Смысл сглаживания: трогаться и останавливаться плавно.
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run components/simulator/joint-motion.test.ts`
Expected: FAIL — модуль `./joint-motion` не найден.

- [ ] **Step 3: Написать модуль**

Создать `components/simulator/joint-motion.ts`:

```ts
/**
 * Арифметика показа движения: сколько оно длится и где рука в середине пути.
 *
 * Модуль лежит здесь, а не в `sim-core`, потому что это показ, а не кинематика.
 * В ядре живёт настоящий планировщик движений с профилями скорости; путать с
 * ним сглаживание картинки не нужно.
 */

/** Угловая скорость показа, рад/с. Не паспортная: столько приятно смотреть. */
const SHOWN_SPEED = 2.4;

export const MIN_DURATION_MS = 90;
export const MAX_DURATION_MS = 900;

/** Сколько шагов в секунду отрабатывается, пока кнопку держат. */
export const HOLD_STEPS_PER_SECOND = 8;

/** Дольше этого нажатие считается удержанием, а не щелчком. */
export const HOLD_THRESHOLD_MS = 250;

/**
 * Длительность показа по самому подвижному суставу.
 *
 * Рука едет всеми суставами одновременно, поэтому решает наибольшее изменение,
 * а не их сумма. Разворот на 180° занимает заметно больше времени, чем шаг в
 * миллиметр, — так же, как у настоящего робота с ограниченной скоростью.
 */
export function motionDuration(from: readonly number[], to: readonly number[]): number {
  let largest = 0;
  const length = Math.max(from.length, to.length);

  for (let index = 0; index < length; index += 1) {
    largest = Math.max(largest, Math.abs((to[index] ?? 0) - (from[index] ?? 0)));
  }

  const milliseconds = (largest / SHOWN_SPEED) * 1000;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, milliseconds));
}

/** Поза на доле `t` пути от `from` к `to`. Длина результата — как у `from`. */
export function interpolateJoints(
  from: readonly number[],
  to: readonly number[],
  t: number,
): number[] {
  return from.map((value, index) => value + ((to[index] ?? 0) - value) * t);
}

/** Сглаживание: трогается и останавливается плавно, в середине быстрее всего. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run components/simulator/joint-motion.test.ts`
Expected: PASS, 9 тестов.

- [ ] **Step 5: Коммит**

```bash
git add components/simulator/joint-motion.ts components/simulator/joint-motion.test.ts
git commit -m "feat: длительность и интерполяция показа движения"
```

---

## Task 5: Хук анимации позы

**Files:**
- Create: `components/simulator/use-animated-joints.ts`

- [ ] **Step 1: Написать хук**

Создать `components/simulator/use-animated-joints.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { easeInOut, interpolateJoints, motionDuration } from './joint-motion';

/**
 * Ведёт показываемую позу к целевой.
 *
 * Целевая поза остаётся логической правдой — это её пишет «Сохранить». Хук
 * возвращает только то, что показывать, поэтому нажатие в середине полёта
 * запишет выбранную позу, а не промежуточную.
 *
 * Глобальное правило `prefers-reduced-motion` в globals.css гасит переходы CSS,
 * но на `requestAnimationFrame` не влияет никак — медиазапрос проверяется здесь.
 */
export function useAnimatedJoints(target: readonly number[] | null): readonly number[] | null {
  const [shown, setShown] = useState<readonly number[] | null>(target);
  const from = useRef<readonly number[] | null>(target);
  const frame = useRef(0);

  useEffect(() => {
    if (target === null) {
      from.current = null;
      setShown(null);
      return;
    }

    // Первое появление копии — не движение, а возникновение: ехать неоткуда.
    const start = from.current;
    if (start === null || start.length !== target.length || reducedMotion()) {
      from.current = target;
      setShown(target);
      return;
    }

    const duration = motionDuration(start, target);
    const began = performance.now();

    const tick = (): void => {
      const progress = Math.min(1, (performance.now() - began) / duration);
      const next = interpolateJoints(start, target, easeInOut(progress));

      from.current = next;
      setShown(next);

      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else from.current = target;
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target]);

  return shown;
}

function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

- [ ] **Step 3: Коммит**

```bash
git add components/simulator/use-animated-joints.ts
git commit -m "feat: показываемая поза едет к целевой"
```

---

## Task 6: Хук удержания кнопки

**Files:**
- Create: `components/simulator/use-hold-jog.ts`

- [ ] **Step 1: Написать хук**

Создать `components/simulator/use-hold-jog.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HOLD_STEPS_PER_SECOND, HOLD_THRESHOLD_MS } from './joint-motion';

/**
 * Короткое нажатие против удержания, как на промышленном пульте.
 *
 * Удержание не заводит отдельного пути в обратную задачу: оно повторяет тот же
 * одиночный шаг восемь раз в секунду, а хук анимации сглаживает эти шаги в
 * непрерывное движение.
 *
 * Свежесть замыкания держится ссылкой на последний вызов: интервал живёт между
 * рендерами и без неё двигал бы робота от позы, устаревшей на момент нажатия.
 */

export interface HoldHandlers {
  readonly onPointerDown: () => void;
  readonly onPointerUp: () => void;
  readonly onPointerLeave: () => void;
  readonly onPointerCancel: () => void;
}

export function useHoldJog(): {
  /** Кнопка, которую держат прямо сейчас, или null: для подсветки. */
  readonly held: string | null;
  /** `step` возвращает false, если дальше не достаём — тогда движение встаёт. */
  bind: (id: string, step: () => boolean) => HoldHandlers;
} {
  const [held, setHeld] = useState<string | null>(null);
  const latest = useRef<() => boolean>(() => false);
  const timer = useRef<number | null>(null);
  const delay = useRef<number | null>(null);

  const stop = useCallback((): void => {
    if (delay.current !== null) window.clearTimeout(delay.current);
    if (timer.current !== null) window.clearInterval(timer.current);
    delay.current = null;
    timer.current = null;
    setHeld(null);
  }, []);

  // Уход фокуса окном: без этого переключение вкладки на середине удержания
  // оставило бы робота едущим, и вернувшийся человек нашёл бы руку неизвестно где.
  useEffect(() => {
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('blur', stop);
      stop();
    };
  }, [stop]);

  const bind = (id: string, step: () => boolean): HoldHandlers => {
    // Ключевая строка. Пока кнопку держат, поза меняется восемь раз в секунду,
    // компонент перерисовывается и сюда приходит новое замыкание. Интервал же
    // живёт между рендерами: без этого обновления он до конца удержания двигал
    // бы робота от позы, устаревшей на момент нажатия.
    if (held === id) latest.current = step;

    return {
      onPointerDown: () => {
        latest.current = step;
        // Шаг делаем сразу: нажатие обязано отзываться, а не ждать порога.
        if (!latest.current()) return;

        setHeld(id);
        delay.current = window.setTimeout(() => {
          timer.current = window.setInterval(() => {
            if (!latest.current()) stop();
          }, 1000 / HOLD_STEPS_PER_SECOND);
        }, HOLD_THRESHOLD_MS);
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
    };
  };

  return { held, bind };
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

- [ ] **Step 3: Коммит**

```bash
git add components/simulator/use-hold-jog.ts
git commit -m "feat: удержание кнопки подвода двигает робота непрерывно"
```

---

## Task 7: Круглые кнопки с удержанием

**Files:**
- Modify: `components/simulator/cartesian-panel.tsx`

- [ ] **Step 1: Подключить удержание**

В `components/simulator/cartesian-panel.tsx` заменить импорт React и добавить хук:

```tsx
import { useState, type KeyboardEvent } from 'react';
import { useHoldJog, type HoldHandlers } from './use-hold-jog';
```

Изменить тип `onJog` в пропсах: он теперь сообщает, удался ли шаг, чтобы удержание вставало на пределе.

```tsx
  onJog: (frame: JogFrame, axis: JogAxis, delta: number) => boolean;
```

Внутри компонента рядом с `const [step, setStep] = useState(DEFAULT_STEP);` добавить:

```tsx
  const hold = useHoldJog();
```

- [ ] **Step 2: Сделать кнопки круглыми и тактильными**

Заменить обе кнопки `−` и `+` в разметке строки оси на:

```tsx
            <JogButton
              id={`jog-${axis}-minus`}
              held={hold.held === `jog-${axis}-minus`}
              handlers={hold.bind(`jog-${axis}-minus`, () => onJog(frame, axis, -delta))}
              label="−"
            />
```

и

```tsx
            <JogButton
              id={`jog-${axis}-plus`}
              held={hold.held === `jog-${axis}-plus`}
              handlers={hold.bind(`jog-${axis}-plus`, () => onJog(frame, axis, delta))}
              label="+"
            />
```

Внизу файла, рядом с `Choice`, добавить компонент кнопки:

```tsx
/**
 * Кнопка подвода: круглая, крупная, с явным состоянием удержания.
 *
 * `touch-none` обязателен — иначе на планшете жест прокрутки перехватит
 * удержание и робот поедет вместе со страницей.
 */
function JogButton({
  id,
  held,
  handlers,
  label,
}: {
  id: string;
  held: boolean;
  handlers: HoldHandlers;
  label: string;
}) {
  return (
    <button
      type="button"
      data-testid={id}
      aria-label={label}
      className={`flex h-8 w-8 shrink-0 touch-none select-none items-center justify-center rounded-full border font-mono text-sm transition-colors ${
        held
          ? 'border-brand bg-brand/25 text-ink'
          : 'border-line text-ink-dim hover:border-line hover:bg-surface-2 hover:text-ink'
      }`}
      {...handlers}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: ошибка в `lesson-workspace.tsx` — `jogTeaching` возвращает `void`, а панель ждёт `boolean`. Чинится следующей задачей.

- [ ] **Step 4: Коммит после Task 8**

Эта задача и следующая правят две стороны одного контракта, поэтому коммит общий — он в Task 8.

---

## Task 8: Проводка на экране урока

**Files:**
- Modify: `components/simulator/lesson-workspace.tsx`

- [ ] **Step 1: Жог сообщает исход**

В `components/simulator/lesson-workspace.tsx` добавить импорт:

```tsx
import { useAnimatedJoints } from './use-animated-joints';
```

Заменить `applyJog` и три обработчика на версии, возвращающие исход. Функциональное обновление здесь не годится: удержанию нужно знать прямо сейчас, удался ли шаг, а внутри обновляющей функции этого не вернуть. Замыкание свежее — хук удержания зовёт последнее.

```tsx
  /** Общая часть: результат шага либо кладём в позу, либо говорим, что не достаём. */
  const applyJog = (compute: (joints: readonly number[]) => JogResult): boolean => {
    if (teaching === null) return false;

    const result = compute(teaching.joints);
    // Копия уже там, куда её привели: прежняя оговорка с этого момента неверна.
    setTeaching(
      result.ok
        ? { ...teaching, joints: result.joints, note: 'ok' }
        : { ...teaching, note: 'blocked' },
    );

    return result.ok;
  };

  const jogTeaching = (frame: JogFrame, axis: JogAxis, delta: number): boolean =>
    applyJog((joints) => jogPose(chain, joints, frame, axis, delta));

  const poseTeaching = (pose: Pose): void => {
    applyJog((joints) => jogToPose(chain, joints, pose));
  };

  const alignTeaching = (): void => {
    applyJog((joints) => alignToolDown(chain, joints));
  };
```

- [ ] **Step 2: Отдать копии показываемую позу**

Рядом с `const [teaching, setTeaching] = useState<Teaching | null>(null);` добавить:

```tsx
  // Копия едет к целевой позе, а панель показывает саму цель: числовые поля
  // неуправляемые и перемонтируются по `key`, так что шестьдесят обновлений в
  // секунду сделали бы их непечатаемыми.
  const shownJoints = useAnimatedJoints(teaching?.joints ?? null);
```

В сцене заменить три места, где стоит `teaching.joints`, на показываемую позу:

```tsx
            {teaching !== null && shownJoints !== null && (
              <>
                <GhostRobot source={model.robot} jointNames={jointNames} values={shownJoints} />
                <FlangeTriad chain={chain} values={shownJoints} size={bounds.radius * 0.25} />
                <BaseTriad size={bounds.radius * 0.25} />
              </>
            )}
```

Панель показа (`values={teaching.joints}`) не трогаем — она остаётся на логической позе.

- [ ] **Step 3: Проверить типы и тесты**

Run: `npm run typecheck && npm test`
Expected: typecheck без вывода, тесты PASS.

- [ ] **Step 4: Коммит**

```bash
git add components/simulator/cartesian-panel.tsx components/simulator/lesson-workspace.tsx
git commit -m "feat: копия едет между позами, кнопки подвода работают удержанием"
```

---

## Task 9: Сквозные тесты

**Files:**
- Modify: `tests/e2e/lesson.spec.ts`

- [ ] **Step 1: Написать тесты**

Добавить в конец `tests/e2e/lesson.spec.ts`:

```ts
test('удержание кнопки двигает дальше одного шага', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();
  await page.getByTestId('step-1').click();

  const before = Number(await page.getByTestId('axis-Z').inputValue());

  // Щелчок для сравнения: один шаг.
  await page.getByTestId('jog-z-plus').click();
  const afterTap = Number(await page.getByTestId('axis-Z').inputValue());

  // Удержание: порог 250 мс плюс восемь шагов в секунду.
  await page.getByTestId('jog-z-plus').hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();

  const afterHold = Number(await page.getByTestId('axis-Z').inputValue());

  expect(afterTap - before).toBeGreaterThan(0);
  expect(afterHold - afterTap).toBeGreaterThan(afterTap - before);
});

test('отпускание кнопки останавливает движение', async ({ page }) => {
  await page.locator(FIRST_MOVE_TEACH).last().click();
  await page.getByTestId('teach-tab-cartesian').click();
  await page.getByTestId('step-1').click();

  await page.getByTestId('jog-z-plus').hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();

  const atRelease = Number(await page.getByTestId('axis-Z').inputValue());
  await page.waitForTimeout(700);

  expect(Number(await page.getByTestId('axis-Z').inputValue())).toBe(atRelease);
});
```

- [ ] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/lesson.spec.ts`
Expected: PASS, прежние 18 тестов урока плюс 2 новых.

- [ ] **Step 3: Коммит**

```bash
git add tests/e2e/lesson.spec.ts
git commit -m "test: удержание кнопки подвода и остановка по отпусканию"
```

---

## Task 10: Проверка целиком

**Files:** нет

- [ ] **Step 1: Типы**

Run: `npm run typecheck`
Expected: без вывода.

- [ ] **Step 2: Unit**

Run: `npm test`
Expected: PASS, не меньше прежних 347 тестов плюс 9 новых.

- [ ] **Step 3: E2E**

Run: `npx playwright test`
Expected: PASS, прежние 26 плюс 2 новых.

- [ ] **Step 4: Посмотреть глазами**

Открыть урок и проверить: на металле робота видны блики, в столешнице отражение,
под роботом мягкая тень; кнопка «инструмент вниз» доводит копию плавно и заметно
дольше, чем шаг в миллиметр; удержание кнопки двигает непрерывно, отпускание
останавливает; счётчик не ниже 60 fps.

- [ ] **Step 5: Закрыть ветку**

Использовать `superpowers:finishing-a-development-branch`.
