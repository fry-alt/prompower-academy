import type { RobotPlugin } from '@prompower/sim-core';

/**
 * Временная модель шестиосевого кобота JAKA на период, пока нет URDF и мешей
 * от PROMPOWER.
 *
 * Исходник — https://github.com/Haoyi-SJTU/jaka_description под MIT, копия
 * лицензии лежит рядом в LICENSE.upstream. Материалы в URDF переименованы, чтобы
 * робот красился из палитры ниже, а не в фирменные цвета JAKA. Предупреждение
 * в интерфейсе оставлено намеренно: это не финальная модель PROMPOWER.
 *
 * Пределы суставов и геометрия читаются из URDF, здесь их нет.
 */
export const jaka6Dof: RobotPlugin = {
  id: 'jaka-6dof',
  displayNameKey: 'robots.jaka6Dof.name',
  placeholderNoticeKey: 'robots.jaka6Dof.notice',
  urdfUrl: '/models/jaka-6dof/jaka-6dof.urdf',
  packages: {},
  joints: [
    { urdfName: 'joint_1', labelKey: 'robots.joints.base', type: 'revolute' },
    { urdfName: 'joint_2', labelKey: 'robots.joints.shoulder', type: 'revolute' },
    { urdfName: 'joint_3', labelKey: 'robots.joints.elbow', type: 'revolute' },
    { urdfName: 'joint_4', labelKey: 'robots.joints.wrist1', type: 'revolute' },
    { urdfName: 'joint_5', labelKey: 'robots.joints.wrist2', type: 'revolute' },
    { urdfName: 'joint_6', labelKey: 'robots.joints.wrist3', type: 'revolute' },
  ],
  homePose: [0, -0.6, 1.2, 0, 0.9, 0],
  palette: {
    base: '#c9ccd1',
    joint: '#4a4f57',
    accent: '#8b9099',
  },
  scene: {
    tableHeight: 0.75,
    tableSize: [1.2, 0.9],
    cameraZoom: 1.45,
  },
};

export default jaka6Dof;
