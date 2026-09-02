/**
 * Банки цифровых входов и выходов.
 *
 * На планшете JAKA экран ввода-вывода разделён вкладками «Control cabinet» и
 * «Tool»: у шкафа управления и у инструмента свои каналы со своей нумерацией.
 * Захват на реальной ячейке висит на выходе банка инструмента, поэтому без
 * этого различия нельзя честно сгенерировать код для него.
 *
 * Нумерация каналов идёт **с единицы**, как в интерфейсе и в скрипте под JAKA
 * SDK. Расхождение «DO1 на экране, index 0 в коде» — источник ошибок на ровном
 * месте, и мы его не заводим.
 */

export type IoBank = 'cabinet' | 'tool';

export const IO_BANKS: readonly IoBank[] = ['cabinet', 'tool'];

/** Сколько каналов в каждом банке. Числа взяты с экрана ввода-вывода планшета. */
export const DEFAULT_IO_LAYOUT: Readonly<
  Record<IoBank, { readonly inputs: number; readonly outputs: number }>
> = {
  cabinet: { inputs: 10, outputs: 8 },
  tool: { inputs: 2, outputs: 2 },
};

export function isIoBank(value: unknown): value is IoBank {
  return value === 'cabinet' || value === 'tool';
}

/** Как банк называется в интерфейсе и в сообщениях об ошибках. */
export function ioBankLabel(bank: IoBank): string {
  return bank === 'cabinet' ? 'шкафа управления' : 'инструмента';
}
