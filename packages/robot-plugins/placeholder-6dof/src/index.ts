import type { RobotPlugin } from '@prompower/sim-core';

/**
 * Учебная заглушка на время, пока нет URDF и мешей PROMPOWER.
 *
 * Геометрия — примитивы, пределы суставов круглые и выдуманные. Ничего из этого
 * не описывает реальный кобот. Флаг `isPlaceholder` включает предупреждение в
 * интерфейсе; настоящая модель добавляется соседним каталогом плагина.
 */
export const placeholder6Dof: RobotPlugin = {
  id: 'placeholder-6dof',
  displayNameKey: 'robots.placeholder6Dof.name',
  isPlaceholder: true,
  urdfUrl: '/models/placeholder-6dof/placeholder-6dof.urdf',
  packages: {},
  joints: [
    { urdfName: 'joint_1', labelKey: 'robots.joints.base', type: 'revolute' },
    { urdfName: 'joint_2', labelKey: 'robots.joints.shoulder', type: 'revolute' },
    { urdfName: 'joint_3', labelKey: 'robots.joints.elbow', type: 'revolute' },
    { urdfName: 'joint_4', labelKey: 'robots.joints.wrist1', type: 'revolute' },
    { urdfName: 'joint_5', labelKey: 'robots.joints.wrist2', type: 'revolute' },
    { urdfName: 'joint_6', labelKey: 'robots.joints.wrist3', type: 'revolute' },
  ],
  homePose: [0, 0.5, -1.0, 0, 0.5, 0],
  palette: {
    base: '#c9ccd1',
    joint: '#4a4f57',
    accent: '#8b9099',
  },
  scene: {
    tableHeight: 0.75,
    tableSize: [1.4, 1.0],
    cameraDistance: 2.2,
  },
};

export default placeholder6Dof;
