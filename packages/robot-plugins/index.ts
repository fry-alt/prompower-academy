import type { RobotPlugin } from '@prompower/sim-core';
import { jakaZu5 } from './models/jaka-zu5/plugin';
import { jakaZu7 } from './models/jaka-zu7/plugin';
import { jakaZu12 } from './models/jaka-zu12/plugin';
import { jakaZu15 } from './models/jaka-zu15/plugin';
import { jakaZu18 } from './models/jaka-zu18/plugin';
import { jakaZu20 } from './models/jaka-zu20/plugin';
import { jakaZu30 } from './models/jaka-zu30/plugin';
import { placeholder6Dof } from './models/placeholder-6dof/plugin';

/**
 * Реестр моделей коботов.
 *
 * Добавление модели — каталог в `models/` и строка здесь. Код приложения и
 * вьюера при этом не меняется: всё, что оно знает о роботе, приходит из URDF и
 * из конфига плагина.
 *
 * Порядок в списке — порядок в выпадающем списке на странице.
 */
export const robotPlugins: readonly RobotPlugin[] = [
  jakaZu5,
  jakaZu7,
  jakaZu12,
  jakaZu15,
  jakaZu18,
  jakaZu20,
  jakaZu30,
  placeholder6Dof,
];

/** Средняя модель серии: не самая маленькая и не самая громоздкая на экране. */
export const defaultRobotId = 'jaka-zu7';

export function getRobotPlugin(id: string): RobotPlugin | undefined {
  return robotPlugins.find((plugin) => plugin.id === id);
}

export { jakaZu5, jakaZu7, jakaZu12, jakaZu15, jakaZu18, jakaZu20, jakaZu30, placeholder6Dof };
