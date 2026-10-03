'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toPython, type PythonOptions } from '@prompower/blocks';
import type { Program, Statement } from '@prompower/sim-core';
import { BlockEditor, clearDraft, type TeachRequest } from './block-editor';
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
  fileName,
  draftKey,
  python,
  onProgram,
  onTeach,
}: {
  program: Program;
  starter: object;
  /** Исполняемая сейчас инструкция — подсвечивается в списке. */
  current: Statement | null;
  error: string | null;
  /** Имя файла для скачивания: идентификатор задания, а не заголовок урока. */
  fileName: string;
  /** Ключ черновика программы в браузере. */
  draftKey: string;
  /** Параметры скрипта, взятые из модели робота. */
  python: PythonOptions;
  onProgram: (program: Program, error: string | null) => void;
  onTeach: (request: TeachRequest) => void;
}) {
  const t = useTranslations('lesson');
  const [tab, setTab] = useState<Tab>('blocks');
  // Номер холста: «Начать заново» пересоздаёт редактор со стартовой программой.
  const [generation, setGeneration] = useState(0);

  // Скрипт считается один раз: показанное и скачанное обязаны совпадать.
  const script = useMemo(() => toPython(program, python), [program, python]);

  const restart = (): void => {
    if (!window.confirm(t('restartProgramConfirm'))) return;
    clearDraft(draftKey);
    setGeneration((value) => value + 1);
    setTab('blocks');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Переключатели те же, что в панели показа точки: два разных вида
          переключателей в одном экране путают. */}
      <div className="flex gap-1 border-b border-line px-3 py-2">
        {(['blocks', 'list', 'code'] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-testid={`tab-${value}`}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={
              tab === value
                ? 'rounded-panel border border-brand/50 bg-brand/15 px-2.5 py-1 text-xs text-ink'
                : 'rounded-panel border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-ink'
            }
          >
            {t(`tab.${value}`)}
          </button>
        ))}

        <button
          type="button"
          data-testid="restart-program"
          onClick={restart}
          className="ml-auto rounded-panel border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-ink"
        >
          {t('restartProgram')}
        </button>
      </div>

      {error !== null && (
        <p data-testid="program-error" className="border-b border-line px-3 py-2 text-sm text-warn">
          {error}
        </p>
      )}

      {/* Редактор держим смонтированным: Blockly теряет холст при размонтировании. */}
      <div className={tab === 'blocks' ? 'min-h-0 flex-1' : 'hidden'}>
        <BlockEditor
          key={generation}
          initial={starter}
          draftKey={draftKey}
          onChange={onProgram}
          onTeach={onTeach}
        />
      </div>

      {tab === 'list' && (
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <ProgramList program={program} current={current} />
        </div>
      )}

      {tab === 'code' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <pre
              data-testid="python-code"
              className="p-3 font-mono text-xs leading-relaxed text-ink-dim"
            >
              {script}
            </pre>
          </div>

          <div className="border-t border-line px-3 py-2">
            <button
              type="button"
              data-testid="download-python"
              onClick={() => download(fileName, script)}
              className="rounded-panel border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-ink"
            >
              {t('downloadPython')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Отдать скрипт файлом.
 *
 * Ссылка отзывается вскоре после нажатия, а не сразу: Firefox и Safari начинают
 * скачивание асинхронно, и немедленный отзыв обрывал его. Но и не висит до
 * перезагрузки — уроков за сессию проходят несколько.
 */
function download(fileName: string, script: string): void {
  const url = URL.createObjectURL(new Blob([script], { type: 'text/x-python;charset=utf-8' }));
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
