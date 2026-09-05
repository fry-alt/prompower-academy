'use client';

import { useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { fieldsFromJoints } from '@prompower/blocks';
import type { JogAxis, JogFrame, KinematicChain, Pose } from '@prompower/sim-core';
import { useHoldJog, type HoldHandlers } from './use-hold-jog';

/**
 * Ручное управление в декартовых координатах: подвод кнопками и точный ввод.
 *
 * Числа всегда показывают позу в системе мира — так же, как на промышленном
 * пульте. Переключатель системы координат меняет только то, куда поедут кнопки
 * `−` и `+`: по осям мира или по осям инструмента.
 */

const MM = 0.001;
const DEG = Math.PI / 180;

/** Шаги подвода: линейные в миллиметрах, угловые в градусах. */
const LINEAR_STEPS = [1, 10, 100] as const;
const ANGULAR_STEPS = [1, 5, 15] as const;
const DEFAULT_STEP = 1;

const LINEAR_AXES = ['x', 'y', 'z'] as const;
const ANGULAR_AXES = ['rx', 'ry', 'rz'] as const;

interface Row {
  readonly axis: JogAxis;
  readonly unit: string;
  readonly delta: number;
}

/** Имя поля позы для оси: у `rx` это `RX`. */
function fieldOf(axis: JogAxis): string {
  return axis.toUpperCase();
}

export function CartesianPanel({
  chain,
  values,
  onJog,
  onPose,
  onAlignDown,
}: {
  chain: KinematicChain;
  values: readonly number[];
  /** Возвращает false, если дальше не достаём: удержание на этом встаёт. */
  onJog: (frame: JogFrame, axis: JogAxis, delta: number) => boolean;
  onPose: (pose: Pose) => void;
  onAlignDown: () => void;
}) {
  const t = useTranslations('lesson');
  const [frame, setFrame] = useState<JogFrame>('world');
  const [step, setStep] = useState(DEFAULT_STEP);
  const hold = useHoldJog();

  // Ровно те числа, что уедут в блок по «Сохранить»: считать их здесь отдельно
  // значило бы показывать одно, а записывать другое.
  const shown = fieldsFromJoints('pose', values, chain);

  const rows: readonly Row[] = [
    ...LINEAR_AXES.map(
      (axis): Row => ({
        axis,
        unit: t('unit.millimetres'),
        delta: (LINEAR_STEPS[step] ?? 1) * MM,
      }),
    ),
    ...ANGULAR_AXES.map(
      (axis): Row => ({
        axis,
        unit: t('unit.degrees'),
        delta: (ANGULAR_STEPS[step] ?? 1) * DEG,
      }),
    ),
  ];

  /** Поза из показанных чисел с заменой одной оси. Миллиметры и градусы — в СИ. */
  const commit = (axis: JogAxis, display: number): void => {
    if (!Number.isFinite(display)) return;

    const next = { ...shown, [fieldOf(axis)]: display };
    onPose({
      x: (next.X ?? 0) * MM,
      y: (next.Y ?? 0) * MM,
      z: (next.Z ?? 0) * MM,
      rx: (next.RX ?? 0) * DEG,
      ry: (next.RY ?? 0) * DEG,
      rz: (next.RZ ?? 0) * DEG,
    });
  };

  const commitOnEnter = (axis: JogAxis) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commit(axis, event.currentTarget.valueAsNumber);
  };

  return (
    <div data-testid="cartesian-panel" className="flex flex-col gap-4">
      <Choice
        label={t('teach.frame.label')}
        options={(['world', 'flange'] as const).map((value) => ({
          value,
          testId: `frame-${value}`,
          label: t(`teach.frame.${value}`),
        }))}
        selected={frame}
        onSelect={setFrame}
      />

      <Choice
        label={t('teach.step')}
        options={LINEAR_STEPS.map((millimetres, index) => ({
          value: index,
          testId: `step-${index}`,
          label: `${millimetres}/${ANGULAR_STEPS[index] ?? ''}`,
        }))}
        selected={step}
        onSelect={setStep}
      />

      <ul className="flex flex-col gap-2">
        {rows.map(({ axis, unit, delta }) => (
          <li key={axis} className="flex items-center gap-2">
            <span className="w-7 font-mono text-xs text-ink-dim">{fieldOf(axis)}</span>

            <JogButton
              id={`jog-${axis}-minus`}
              held={hold.held === `jog-${axis}-minus`}
              handlers={hold.bind(`jog-${axis}-minus`, () => onJog(frame, axis, -delta))}
              label="−"
            />

            {/*
              Поле не управляемое: значение уезжает в робота по Enter или по
              потере фокуса, а не на каждое нажатие клавиши. Иначе набранное
              «120» успело бы съездить обратной задачей как «1», «12» и «120».
              Ключ сбрасывает показанное, когда позу меняют кнопками.
            */}
            <input
              key={shown[fieldOf(axis)] ?? 0}
              type="number"
              data-testid={`axis-${fieldOf(axis)}`}
              defaultValue={shown[fieldOf(axis)] ?? 0}
              onBlur={(event) => commit(axis, event.currentTarget.valueAsNumber)}
              onKeyDown={commitOnEnter(axis)}
              className="w-20 rounded-panel border border-line bg-transparent px-2 py-1 text-right font-mono text-xs tabular-nums text-ink"
            />

            <JogButton
              id={`jog-${axis}-plus`}
              held={hold.held === `jog-${axis}-plus`}
              handlers={hold.bind(`jog-${axis}-plus`, () => onJog(frame, axis, delta))}
              label="+"
            />

            <span className="text-xs text-ink-faint">{unit}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          data-testid="teach-align-down"
          onClick={onAlignDown}
          className="rounded-panel border border-line px-3 py-1.5 text-sm text-ink hover:bg-brand/10"
        >
          {t('teach.alignDown')}
        </button>
        <p className="text-xs text-ink-faint">{t('teach.alignDownNote')}</p>
      </div>
    </div>
  );
}

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
          : 'border-line text-ink-dim hover:bg-surface-2 hover:text-ink'
      }`}
      {...handlers}
    >
      {label}
    </button>
  );
}

/** Ряд кнопок-переключателей: система координат и величина шага устроены одинаково. */
function Choice<T extends string | number>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly { value: T; testId: string; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-faint">{label}</span>
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={option.testId}
            type="button"
            data-testid={option.testId}
            aria-pressed={selected === option.value}
            onClick={() => onSelect(option.value)}
            className={
              selected === option.value
                ? 'rounded-panel border border-brand/50 bg-brand/15 px-2 py-1 font-mono text-xs text-ink'
                : 'rounded-panel border border-line px-2 py-1 font-mono text-xs text-ink-dim hover:text-ink'
            }
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
