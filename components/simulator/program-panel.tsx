'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toPython } from '@prompower/blocks';
import type { Program, Statement } from '@prompower/sim-core';
import { BlockEditor, type TeachRequest } from './block-editor';
import { ProgramList } from './program-list';

/**
 * Панель программы: блоки, их же расшифровка списком и готовый Python.
 *
 * Кнопка «Показать код» из §5.2 брифа сделана вкладками. Смысл тот же и важный:
 * ученик видит, что собранные блоки — это настоящая программа для робота, а не
 * игрушка. Код только для чтения: источник истины — блоки.
 */

type Tab = 'blocks' | 'list' | 'code';

export function ProgramPanel({
  program,
  starter,
  current,
  error,
  onProgram,
  onTeach,
}: {
  program: Program;
  starter: object;
  /** Исполняемая сейчас инструкция — подсвечивается в списке. */
  current: Statement | null;
  error: string | null;
  onProgram: (program: Program, error: string | null) => void;
  onTeach: (request: TeachRequest) => void;
}) {
  const t = useTranslations('lesson');
  const [tab, setTab] = useState<Tab>('blocks');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-1 border-b border-line px-2">
        {(['blocks', 'list', 'code'] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-testid={`tab-${value}`}
            onClick={() => setTab(value)}
            aria-selected={tab === value}
            className={
              tab === value
                ? 'border-b-2 border-brand px-3 py-2 text-sm text-ink'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-ink-faint hover:text-ink-dim'
            }
          >
            {t(`tab.${value}`)}
          </button>
        ))}
      </div>

      {error !== null && (
        <p data-testid="program-error" className="border-b border-line px-3 py-2 text-sm text-warn">
          {error}
        </p>
      )}

      {/* Редактор держим смонтированным: Blockly теряет холст при размонтировании. */}
      <div className={tab === 'blocks' ? 'min-h-0 flex-1' : 'hidden'}>
        <BlockEditor initial={starter} onChange={onProgram} onTeach={onTeach} />
      </div>

      {tab === 'list' && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <ProgramList program={program} current={current} />
        </div>
      )}

      {tab === 'code' && (
        <div className="min-h-0 flex-1 overflow-auto">
          <pre
            data-testid="python-code"
            className="p-3 font-mono text-xs leading-relaxed text-ink-dim"
          >
            {toPython(program)}
          </pre>
        </div>
      )}
    </div>
  );
}
