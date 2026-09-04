import type { URDFRobot } from 'urdf-loader';

/**
 * Раскладывает вектор углов по суставам загруженной модели.
 *
 * Единственный шов, где порядок суставов из конфига плагина встречается с
 * именами из URDF. Он один на всех — и на настоящего робота, и на серую копию,
 * и на первую позу при загрузке: разъедься они, копия показывала бы не то, куда
 * поедет робот, и ни типы, ни тесты этого бы не заметили.
 */
export function applyJointValues(
  robot: URDFRobot,
  jointNames: readonly string[],
  values: readonly number[],
): void {
  jointNames.forEach((name, index) => {
    robot.setJointValue(name, values[index] ?? 0);
  });
}
