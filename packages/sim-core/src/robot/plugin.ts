/**
 * Контракт плагина модели кобота.
 *
 * Каждая модель — отдельный каталог в `packages/robot-plugins/`. Приложение
 * знает только этот интерфейс, поэтому добавление модели не трогает код вьюера.
 * Характеристики самого робота (пределы суставов, длины звеньев) здесь не
 * дублируются — они читаются из URDF при загрузке.
 */

import type { JointType } from '../kinematics/joint-limits';

export interface JointDescriptor {
  /** Имя сустава ровно как в URDF. Расхождение — ошибка загрузки. */
  readonly urdfName: string;
  /** Ключ next-intl для подписи ползунка. Готовых строк в конфиге нет. */
  readonly labelKey: string;
  readonly type: JointType;
}

export interface RobotPalette {
  /** Основной цвет корпуса. */
  readonly base: string;
  /** Цвет узлов суставов. */
  readonly joint: string;
  /** Акцент бренда: фланец, маркировка. */
  readonly accent: string;
}

export interface SceneDefaults {
  /** Высота столешницы над полом, метры. */
  readonly tableHeight: number;
  /** Размер столешницы [ширина, глубина], метры. */
  readonly tableSize: readonly [number, number];
  /**
   * Запас вокруг модели в кадре. 1.0 — модель вписана впритык, 1.3 — с полями.
   * Не метры: вылет у коботов отличается втрое, а рамка должна выглядеть одинаково.
   */
  readonly cameraZoom: number;
}

export interface RobotPlugin {
  /** Slug каталога плагина, он же сегмент пути в `public/models/`. */
  readonly id: string;
  readonly displayNameKey: string;
  /**
   * Ключ next-intl с предупреждением, если модель временная. `null` — это
   * настоящая модель PROMPOWER и предупреждать не о чем.
   *
   * Текст у каждой заглушки свой: у самодельной выдуманы и геометрия, и пределы,
   * у чужой модели они настоящие, но принадлежат не тому роботу.
   */
  readonly placeholderNoticeKey: string | null;
  readonly urdfUrl: string;
  /** Соответствие имён ROS-пакетов путям, для `loader.packages` у urdf-loader. */
  readonly packages: Readonly<Record<string, string>>;
  /** Порядок суставов = порядок ползунков в интерфейсе. */
  readonly joints: readonly JointDescriptor[];
  /** Домашняя поза в радианах, длина совпадает с `joints`. */
  readonly homePose: readonly number[];
  readonly palette: RobotPalette;
  readonly scene: SceneDefaults;
}

/** Конфиг плагина внутренне противоречив — это ошибка сборки плагина, а не пользователя. */
export class RobotPluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RobotPluginError';
  }
}

/**
 * Проверяет самосогласованность конфига до того, как он попадёт в сцену.
 * Совпадение с URDF проверяется отдельно, уже после загрузки модели.
 */
export function assertRobotPluginConsistent(plugin: RobotPlugin): void {
  if (plugin.joints.length === 0) {
    throw new RobotPluginError(`Плагин «${plugin.id}»: не объявлено ни одного сустава`);
  }

  if (plugin.homePose.length !== plugin.joints.length) {
    throw new RobotPluginError(
      `Плагин «${plugin.id}»: домашняя поза из ${plugin.homePose.length} значений ` +
        `не совпадает с ${plugin.joints.length} суставами`,
    );
  }

  const names = new Set<string>();
  for (const joint of plugin.joints) {
    if (names.has(joint.urdfName)) {
      throw new RobotPluginError(`Плагин «${plugin.id}»: сустав «${joint.urdfName}» объявлен дважды`);
    }
    names.add(joint.urdfName);
  }

  for (const value of plugin.homePose) {
    if (!Number.isFinite(value)) {
      throw new RobotPluginError(`Плагин «${plugin.id}»: домашняя поза содержит ${value}`);
    }
  }
}
