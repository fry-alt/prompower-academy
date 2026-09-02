import type { RobotPlugin } from '@prompower/sim-core';

/**
 * Общая часть плагинов серии JAKA Zu.
 *
 * Все модели серии описаны в одном стиле: звенья `Link_0`…`Link_6`, суставы
 * `joint_1`…`joint_6`, один и тот же порядок осей. Отличаются вылетом, пределами
 * и геометрией — а это всё живёт в URDF, а не здесь.
 */

const JOINTS: RobotPlugin['joints'] = [
  { urdfName: 'joint_1', labelKey: 'robots.joints.base' },
  { urdfName: 'joint_2', labelKey: 'robots.joints.shoulder' },
  { urdfName: 'joint_3', labelKey: 'robots.joints.elbow' },
  { urdfName: 'joint_4', labelKey: 'robots.joints.wrist1' },
  { urdfName: 'joint_5', labelKey: 'robots.joints.wrist2' },
  { urdfName: 'joint_6', labelKey: 'robots.joints.wrist3' },
];

/**
 * Цвета по порядку цепи: тёмное основание, светлые оболочки плеча и предплечья,
 * тёмное запястье, акцент на фланце. По именам звеньев это задать нельзя —
 * внутри одной серии они называются четырьмя разными способами.
 */
const CHAIN_COLORS: RobotPlugin['chainColors'] = [
  'joint',
  'base',
  'base',
  'base',
  'joint',
  'base',
  'accent',
];

/**
 * Поза «рука сложена над столом»: читается лучше нулевой, в которой манипулятор
 * вытянут в одну линию. Одинакова для всей серии — пределы суставов у неё общие.
 */
const HOME_POSE = [0, 1.571, 1.571, 0, 1.571, 0];

const PALETTE: RobotPlugin['palette'] = {
  base: '#c9ccd1',
  joint: '#4a4f57',
  accent: '#8b9099',
};

export interface JakaZuOptions {
  /** Slug каталога модели, он же сегмент адреса и путь в `public/models/`. */
  readonly id: string;
  readonly displayNameKey: string;
  /** Размер столешницы под вылет этой модели, метры. */
  readonly tableSize: readonly [number, number];
}

export function jakaZuPlugin({ id, displayNameKey, tableSize }: JakaZuOptions): RobotPlugin {
  return {
    id,
    displayNameKey,
    placeholderNoticeKey: 'robots.jakaSeries.notice',
    urdfUrl: `/models/${id}/${id}.urdf`,
    packages: {},
    joints: JOINTS,
    chainColors: CHAIN_COLORS,
    homePose: HOME_POSE,
    palette: PALETTE,
    scene: { tableHeight: 0.75, tableSize, cameraZoom: 1.45 },
  };
}
