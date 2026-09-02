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
  type Program,
  type Statement,
  type StatementMeta,
  type StatementOp,
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
  type EventLog,
  type IoBankState,
  type SceneObject,
  type SimEvent,
  type Vec3,
  type WorldInit,
  type WorldState,
  type Zone,
} from './world/state';

export { aabbOf, intersects, isInsideZone, type Aabb } from './world/aabb';

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
  TICK_MS,
  type RunOptions,
  type RunState,
  type RunStatus,
} from './interpreter/run';
