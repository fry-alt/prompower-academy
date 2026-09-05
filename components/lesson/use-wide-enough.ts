'use client';

import { useSyncExternalStore } from 'react';

/**
 * Хватает ли ширины окна для рабочего места урока.
 *
 * Спрашиваем окно, а не User-Agent: дело в месте на экране, а не в устройстве,
 * и ноутбук с узким окном должен получить тот же ответ, что и телефон.
 *
 * Планшет в портрете — 768 px, и бриф (§9) разрешает планшет. Ниже — телефон,
 * которому блочный редактор бесполезен.
 */
const WIDE = '(min-width: 768px)';

export function useWideEnough(): boolean {
  return useSyncExternalStore(subscribe, isWide, () => true);
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isWide(): boolean {
  return window.matchMedia(WIDE).matches;
}
