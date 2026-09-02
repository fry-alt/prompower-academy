import { parseXml, XmlElement, type XmlNode } from '@rgrove/parse-xml';
import type { Vec3 } from '../world/state';
import type { JointLimit, JointType } from './joint-limits';
import type { ChainJoint, KinematicChain } from './chain';
import { fromOrigin, IDENTITY, multiply, type Matrix4 } from './transform';

/**
 * Разбор URDF в кинематическую цепь.
 *
 * Тот же текст читает `urdf-loader` для визуализации — файл грузится один раз и
 * отдаётся двум потребителям. Здесь нужна не сцена, а числа: смещения, оси и
 * пределы, поэтому берётся только то, что влияет на кинематику. Блоки `gazebo`,
 * `transmission`, `inertial` и визуалы пропускаются.
 *
 * Разбор идёт XML-парсером без DOM: `sim-core` должен работать и в браузере, и
 * в Node без окружения браузера.
 */

export class UrdfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrdfParseError';
  }
}

const MOVABLE: ReadonlySet<string> = new Set(['revolute', 'continuous', 'prismatic']);
const DEFAULT_AXIS: Vec3 = { x: 1, y: 0, z: 0 };

interface RawJoint {
  readonly name: string;
  readonly type: string;
  readonly parent: string;
  readonly child: string;
  readonly origin: Matrix4;
  readonly axis: Vec3;
  readonly limit: { readonly lower: number; readonly upper: number };
}

/**
 * Собирает цепь по именам подвижных суставов из конфига плагина.
 *
 * Неподвижные суставы между ними складываются в смещения: у моделей JAKA между
 * `world` и основанием стоит фиксированный сустав, и он влияет на позу фланца.
 */
export function parseUrdfChain(xml: string, jointNames: readonly string[]): KinematicChain {
  if (jointNames.length === 0) {
    throw new UrdfParseError('Не задано ни одного сустава: цепь строить не из чего');
  }

  const joints = readJoints(xml);
  const byName = new Map(joints.map((joint) => [joint.name, joint]));
  const byChild = new Map(joints.map((joint) => [joint.child, joint]));
  const byParent = groupByParent(joints);

  const missing = jointNames.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new UrdfParseError(`В URDF нет суставов: ${missing.join(', ')}`);
  }

  const lastName = jointNames[jointNames.length - 1]!;
  const path = pathToRoot(byName.get(lastName)!, byChild);
  assertOrder(path, jointNames);

  return buildChain(path, jointNames, byName.get(lastName)!, byParent);
}

/** Путь от корня модели до заданного сустава включительно. */
function pathToRoot(last: RawJoint, byChild: ReadonlyMap<string, RawJoint>): RawJoint[] {
  const path: RawJoint[] = [];
  let current: RawJoint | undefined = last;
  const seen = new Set<string>();

  while (current !== undefined) {
    if (seen.has(current.name)) {
      throw new UrdfParseError(`В URDF цикл по суставу «${current.name}»`);
    }
    seen.add(current.name);
    path.unshift(current);
    current = byChild.get(current.parent);
  }

  return path;
}

function assertOrder(path: readonly RawJoint[], jointNames: readonly string[]): void {
  const onPath = path.filter((joint) => jointNames.includes(joint.name)).map((joint) => joint.name);
  if (onPath.join('|') !== jointNames.join('|')) {
    throw new UrdfParseError(
      `Порядок суставов в конфиге не совпадает с деревом URDF: ожидалось ${jointNames.join(
        ', ',
      )}, в модели по пути идут ${onPath.join(', ')}`,
    );
  }
}

function buildChain(
  path: readonly RawJoint[],
  jointNames: readonly string[],
  last: RawJoint,
  byParent: ReadonlyMap<string, readonly RawJoint[]>,
): KinematicChain {
  const named = new Set(jointNames);
  const joints: ChainJoint[] = [];

  let baseOrigin = IDENTITY;
  let pending = IDENTITY;
  let started = false;

  for (const raw of path) {
    if (!named.has(raw.name)) {
      // Неподвижный сустав: его смещение уходит в соседний подвижный.
      pending = multiply(pending, raw.origin);
      continue;
    }

    if (!started) {
      baseOrigin = pending;
      pending = IDENTITY;
      started = true;
    }

    joints.push({
      name: raw.name,
      limit: toJointLimit(raw),
      origin: multiply(pending, raw.origin),
      axis: raw.axis,
    });
    pending = IDENTITY;
  }

  return { joints, baseOrigin, toolOrigin: trailingFixed(last.child, byParent) };
}

/**
 * Хвост из неподвижных суставов за последним подвижным — обычно это фланец
 * инструмента, `tool0`. Идём вниз, пока путь однозначен: развилка означает, что
 * у робота несколько инструментов, и выбирать за пользователя мы не станем.
 */
function trailingFixed(fromLink: string, byParent: ReadonlyMap<string, readonly RawJoint[]>): Matrix4 {
  let transform = IDENTITY;
  let link = fromLink;

  for (;;) {
    const children = byParent.get(link) ?? [];
    const fixed = children.filter((joint) => !MOVABLE.has(joint.type));
    if (fixed.length !== 1 || children.length !== fixed.length) return transform;

    const only = fixed[0]!;
    transform = multiply(transform, only.origin);
    link = only.child;
  }
}

function toJointLimit(raw: RawJoint): JointLimit {
  const type = raw.type;
  if (type !== 'revolute' && type !== 'continuous' && type !== 'prismatic') {
    throw new UrdfParseError(`Сустав «${raw.name}»: тип «${type}» симулятор не поддерживает`);
  }
  return { name: raw.name, type, lower: raw.limit.lower, upper: raw.limit.upper };
}

function groupByParent(joints: readonly RawJoint[]): Map<string, RawJoint[]> {
  const map = new Map<string, RawJoint[]>();
  for (const joint of joints) {
    const list = map.get(joint.parent);
    if (list === undefined) map.set(joint.parent, [joint]);
    else list.push(joint);
  }
  return map;
}

// --- чтение XML ---

function readJoints(xml: string): RawJoint[] {
  const document = parse(xml);
  const robot = document.children.find(isElementNamed('robot'));
  if (robot === undefined) {
    throw new UrdfParseError('В файле нет корневого элемента <robot>');
  }

  return robot.children.filter(isElementNamed('joint')).map(readJoint);
}

function parse(xml: string): { children: XmlNode[] } {
  try {
    return parseXml(xml);
  } catch (error) {
    throw new UrdfParseError(
      `URDF не разбирается как XML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readJoint(element: XmlElement): RawJoint {
  const name = element.attributes['name'];
  if (name === undefined) throw new UrdfParseError('У сустава в URDF нет атрибута name');

  const type = element.attributes['type'];
  if (type === undefined) throw new UrdfParseError(`У сустава «${name}» нет атрибута type`);

  const origin = element.children.find(isElementNamed('origin'));
  const axis = element.children.find(isElementNamed('axis'));
  const limit = element.children.find(isElementNamed('limit'));

  return {
    name,
    type,
    parent: linkRef(element, 'parent', name),
    child: linkRef(element, 'child', name),
    origin:
      origin === undefined
        ? IDENTITY
        : fromOrigin(
            triple(origin.attributes['xyz'], { x: 0, y: 0, z: 0 }, name, 'xyz'),
            triple(origin.attributes['rpy'], { x: 0, y: 0, z: 0 }, name, 'rpy'),
          ),
    axis: axis === undefined ? DEFAULT_AXIS : triple(axis.attributes['xyz'], DEFAULT_AXIS, name, 'axis'),
    limit: {
      lower: number(limit?.attributes['lower'], 0, name, 'lower'),
      upper: number(limit?.attributes['upper'], 0, name, 'upper'),
    },
  };
}

function linkRef(element: XmlElement, tag: 'parent' | 'child', jointName: string): string {
  const node = element.children.find(isElementNamed(tag));
  const link = node?.attributes['link'];
  if (link === undefined) {
    throw new UrdfParseError(`У сустава «${jointName}» не указан <${tag} link="…">`);
  }
  return link;
}

function triple(raw: string | undefined, fallback: Vec3, jointName: string, what: string): Vec3 {
  if (raw === undefined) return fallback;

  const parts = raw.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    throw new UrdfParseError(`Сустав «${jointName}»: ${what}="${raw}" — ожидались три числа`);
  }
  return { x: parts[0]!, y: parts[1]!, z: parts[2]! };
}

function number(raw: string | undefined, fallback: number, jointName: string, what: string): number {
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UrdfParseError(`Сустав «${jointName}»: ${what}="${raw}" — ожидалось число`);
  }
  return value;
}

function isElementNamed(name: string): (node: XmlNode) => node is XmlElement {
  return (node): node is XmlElement => node instanceof XmlElement && node.name === name;
}

export type { JointType };
