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

export {
  EMPTY_CHAIN,
  flangePose,
  forwardKinematics,
  jointFrames,
  jointLimits,
  type ChainJoint,
  type KinematicChain,
} from './kinematics/chain';

export { parseUrdfChain, UrdfParseError } from './kinematics/urdf';

export { solveIk, type IkOptions, type IkResult } from './kinematics/ik';

export {
  alignToolDown,
  jogPose,
  jogToPose,
  type JogAxis,
  type JogFrame,
  type JogResult,
} from './kinematics/jog';

export { createPlanner, type PlannerOptions } from './interpreter/planner';

export { distanceToObject, nearestGraspable } from './world/grasp';

export {
  checkGoals,
  checkKeepOuts,
  checkTask,
  earnedHints,
  type CheckResult,
  type GoalStatus,
} from './validators/check';

export {
  parseTask,
  TaskParseError,
  type Constraint,
  type Goal,
  type Hint,
  type Task,
  type TaskMode,
  type TaskWorld,
} from './validators/task';

export {
  fromAxisAngle,
  fromOrigin,
  fromPose,
  fromRpy,
  fromTranslation,
  IDENTITY,
  invert,
  multiply,
  poseOf,
  rpyOf,
  transformPoint,
  translationOf,
  type Matrix4,
} from './kinematics/transform';

export {
  DEFAULT_IO_LAYOUT,
  IO_BANKS,
  ioBankLabel,
  isIoBank,
  type IoBank,
} from './io';

export {
  PROGRAM_VERSION,
  type BinaryOperator,
  type CompareOperator,
  type Condition,
  type Expression,
  type GripperAction,
  type MotionParams,
  type Pose,
  type PoseInput,
  type Program,
  type Statement,
  type StatementMeta,
  type StatementOp,
  type Value,
} from './program/ast';

export { parseProgram, ProgramParseError } from './program/parse';

export {
  advanceTick,
  createWorld,
  digitalInput,
  digitalOutput,
  graspObject,
  moveObject,
  releaseObject,
  setDigitalInput,
  setDigitalOutput,
  setJoints,
  setVariable,
  type Conveyor,
  type EventLog,
  type IoBankState,
  type SceneObject,
  type Sensor,
  type SimEvent,
  type Vec3,
  type WorldInit,
  type WorldState,
  type Zone,
} from './world/state';

export {
  aabbOf,
  distanceToBox,
  intersects,
  isInsideZone,
  zoneContaining,
  type Aabb,
} from './world/aabb';

export {
  planned,
  refused,
  type MotionPlan,
  type MotionPlanner,
  type MotionRefusal,
  type MotionResult,
} from './interpreter/motion';

export {
  createRun,
  evaluate,
  evaluateCondition,
  runToCompletion,
  step,
  type RunOptions,
  type RunState,
  type RunStatus,
} from './interpreter/run';
export { TICK_MS } from './tick';
