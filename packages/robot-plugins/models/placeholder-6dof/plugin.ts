import type { RobotPlugin } from '@prompower/sim-core';

/**
 * Шестиосевой манипулятор из примитивов: цилиндры и боксы прямо в URDF, мешей нет.
 *
 * Не имеет отношения ни к PROMPOWER, ни к JAKA — геометрия и пределы суставов
 * выдуманы. Полезен как пример минимального плагина и как быстрый объект для
 * тестов: грузится мгновенно и не тянет за собой ни одного файла мешей.
 */
export const placeholder6Dof: RobotPlugin = {
  id: 'placeholder-6dof',
  displayNameKey: 'robots.placeholder6Dof.name',
  placeholderNoticeKey: 'robots.placeholder6Dof.notice',
  urdfUrl: '/models/placeholder-6dof/placeholder-6dof.urdf',
  packages: {},
  joints: [
    { urdfName: 'joint_1', labelKey: 'robots.joints.base' },
    { urdfName: 'joint_2', labelKey: 'robots.joints.shoulder' },
    { urdfName: 'joint_3', labelKey: 'robots.joints.elbow' },
    { urdfName: 'joint_4', labelKey: 'robots.joints.wrist1' },
    { urdfName: 'joint_5', labelKey: 'robots.joints.wrist2' },
    { urdfName: 'joint_6', labelKey: 'robots.joints.wrist3' },
  ],
  chainColors: ['joint', 'base', 'base', 'base', 'joint', 'joint', 'accent'],
  homePose: [0, 0.5, -1.0, 0, 0.5, 0],
  palette: {
    base: '#c9ccd1',
    joint: '#4a4f57',
    accent: '#8b9099',
  },
  scene: {
    tableHeight: 0.75,
    tableSize: [1.4, 1.0],
    cameraZoom: 1.45,
  },
};
