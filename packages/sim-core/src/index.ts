export {
  clampJointValue,
  clampJointVector,
  isWithinLimits,
  normalizeAngle,
  type JointLimit,
  type JointType,
} from './kinematics/joint-limits';

export {
  assertRobotPluginConsistent,
  RobotPluginError,
  type JointDescriptor,
  type RobotPalette,
  type RobotPlugin,
  type SceneDefaults,
} from './robot/plugin';
