'use client';

import { useTranslations } from 'next-intl';
import type { Program, Statement } from '@prompower/sim-core';

/**
 * Программа списком, с подсветкой исполняемой инструкции.
 *
 * До появления Blockly это единственное окно в программу, и оно же проверяет,
 * что интерпретатор действительно сообщает текущий шаг: подсветка едет ровно по
 * тому, что он вернул.
 */

const RAD_TO_DEG = 180 / Math.PI;

export function ProgramList({
  program,
  current,
}: {
  program: Program;
  current: Statement | null;
}) {
  const t = useTranslations('lesson');

  return (
    <ol className="flex flex-col gap-0.5 font-mono text-xs">
      {program.body.map((statement, index) => (
        <li
          key={statement.id ?? index}
          data-current={statement === current ? 'true' : undefined}
          data-testid="program-line"
          className={
            statement === current
              ? 'rounded-panel bg-brand/15 px-2 py-1 text-ink ring-1 ring-brand/40'
              : 'rounded-panel px-2 py-1 text-ink-dim'
          }
        >
          <span className="mr-2 text-ink-faint">{String(index + 1).padStart(2, '0')}</span>
          {describe(statement, t)}
        </li>
      ))}
    </ol>
  );
}

type Translate = ReturnType<typeof useTranslations<'lesson'>>;

/**
 * Человеческое описание инструкции.
 *
 * Углы и координаты показываются в градусах и миллиметрах — так же, как на
 * планшете JAKA. В ядре они остаются в радианах и метрах.
 */
function describe(statement: Statement, t: Translate): string {
  switch (statement.op) {
    case 'comment':
      return `— ${statement.text}`;
    case 'moveJ':
      return `${t('op.moveJ')} ${statement.joints.map((v) => `${(v * RAD_TO_DEG).toFixed(0)}°`).join(' ')}`;
    case 'moveL':
      return `${t('op.moveL')} ${mm(statement.pose.x)} ${mm(statement.pose.y)} ${mm(statement.pose.z)}`;
    case 'gripper':
      return statement.action === 'close' ? t('op.gripperClose') : t('op.gripperOpen');
    case 'wait':
      return `${t('op.wait')} ${(statement.ms / 1000).toFixed(1)} ${t('unit.seconds')}`;
    case 'setDO':
      return `${t('op.setDO')} ${bank(statement.bank, t)} DO${statement.index} = ${statement.value ? 'ON' : 'OFF'}`;
    case 'waitDI':
      return `${t('op.waitDI')} ${bank(statement.bank, t)} DI${statement.index} = ${statement.value ? 'ON' : 'OFF'}`;
    case 'repeat':
      return `${t('op.repeat')} ${statement.times}`;
    case 'while':
      return t('op.while');
    case 'if':
      return t('op.if');
    case 'setVar':
      return `${statement.name} =`;
  }
}

function bank(value: 'cabinet' | 'tool', t: Translate): string {
  return value === 'cabinet' ? t('bank.cabinet') : t('bank.tool');
}

function mm(metres: number): string {
  return `${Math.round(metres * 1000)}`;
}
