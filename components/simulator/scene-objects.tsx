'use client';

import { useMemo } from 'react';
import { DoubleSide, EdgesGeometry, PlaneGeometry } from 'three';
import type { Conveyor, SceneObject, Sensor, Zone } from '@prompower/sim-core';
import { sizeToScene, toScene } from './scene-frame';

/**
 * Детали, зоны, ленты и датчики на столе.
 *
 * Пересчёт координат мира в координаты сцены живёт в `scene-frame.ts` — он
 * нужен не только здесь.
 */

export function SceneObjects({
  objects,
  zones,
  conveyors,
  sensors,
  sensorOn,
  heldId,
}: {
  objects: Readonly<Record<string, SceneObject>>;
  zones: Readonly<Record<string, Zone>>;
  conveyors: Readonly<Record<string, Conveyor>>;
  sensors: Readonly<Record<string, Sensor>>;
  /** Какие датчики сейчас видят деталь. Берётся из входов, а не считается заново. */
  sensorOn: Readonly<Record<string, boolean>>;
  /** Деталь в захвате подсвечивается: видно, что робот её действительно взял. */
  heldId: string | null;
}) {
  const zoneList = useMemo(() => Object.values(zones), [zones]);
  const objectList = useMemo(() => Object.values(objects), [objects]);
  const beltList = useMemo(() => Object.values(conveyors), [conveyors]);
  const sensorList = useMemo(() => Object.values(sensors), [sensors]);

  return (
    <group>
      {beltList.map((belt) => (
        <ConveyorBed key={belt.id} belt={belt} />
      ))}

      {sensorList.map((sensor) => (
        <SensorEye key={sensor.id} sensor={sensor} on={sensorOn[sensor.id] === true} />
      ))}

      {zoneList.map((zone) => (
        <ZonePatch key={zone.id} zone={zone} />
      ))}

      {objectList.map((object) => (
        <mesh key={object.id} position={toScene(object.position)} castShadow receiveShadow>
          <boxGeometry args={sizeToScene(object.size)} />
          <meshPhongMaterial
            color={object.id === heldId ? '#e08a3c' : '#9aa3ad'}
            shininess={30}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Высота бортов ленты. Деталь между ними стоит на столе, как и раньше. */
const RAIL_HEIGHT = 0.022;
const RAIL_WIDTH = 0.012;

/** Сколько поперечных планок рисуем на метр ленты. */
const SLATS_PER_METER = 12;

/** Насколько упор отодвинут за край ленты, чтобы не входить в остановившуюся деталь. */
const STOP_CLEARANCE = 0.03;

/**
 * Лента конвейера: два борта, планки между ними и упор в конце.
 *
 * Коробка ленты в состоянии мира говорит, кого она везёт, а не как она
 * выглядит, — ровно как коробка зоны. Полотно поэтому лежит вровень со столом:
 * деталь на нём стоит на той же высоте, что и на столе, и высота захвата из
 * прошлого урока остаётся верной. Видимой лента становится за счёт бортов.
 *
 * Упор в конце — не просто украшение: он показывает место, где деталь
 * остановится, до того как она туда доедет.
 */
function ConveyorBed({ belt }: { belt: Conveyor }) {
  const slats = useMemo(() => {
    const count = Math.max(2, Math.round(belt.size.y * SLATS_PER_METER));
    const gap = belt.size.y / count;
    return [...Array(count - 1)].map((_, index) => -belt.size.y / 2 + gap * (index + 1));
  }, [belt.size.y]);

  const rail = belt.size.x / 2 - RAIL_WIDTH / 2;
  // Край, к которому лента везёт: там деталь и остановится.
  const stop = (Math.sign(belt.speed) * belt.size.y) / 2;

  return (
    <group position={toScene({ ...belt.position, z: 0 })}>
      {[-rail, rail].map((side) => (
        <mesh key={side} position={[side, RAIL_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[RAIL_WIDTH, RAIL_HEIGHT, belt.size.y]} />
          <meshPhongMaterial color="#3a424d" shininess={20} />
        </mesh>
      ))}

      {slats.map((offset) => (
        <mesh key={offset} position={[0, 0.001, -offset]}>
          <boxGeometry args={[belt.size.x - RAIL_WIDTH * 2, 0.002, 0.005]} />
          <meshBasicMaterial color="#39414b" />
        </mesh>
      ))}

      <mesh
        position={[0, RAIL_HEIGHT / 2, -(stop + Math.sign(belt.speed) * STOP_CLEARANCE)]}
        castShadow
      >
        <boxGeometry args={[belt.size.x, RAIL_HEIGHT, 0.01]} />
        <meshPhongMaterial color="#4d5766" shininess={20} />
      </mesh>
    </group>
  );
}

/**
 * Оптический датчик: стойка сбоку и луч поперёк ленты.
 *
 * Луч загорается акцентом, когда вход включён. Это единственное место в сцене,
 * где виден сигнал, и без него ученику непонятно, чего именно ждёт программа.
 */
function SensorEye({ sensor, on }: { sensor: Sensor; on: boolean }) {
  const reach = sensor.size.x;
  const post = reach / 2 + 0.02;
  const beam = on ? '#f3821d' : '#6b7480';

  return (
    <group position={toScene({ ...sensor.position, z: 0.02 })}>
      {/* Излучатель с одной стороны и отражатель с другой: так датчик читается
          как перегороженный лучом проём, а не как деталь на столе. */}
      <mesh position={[-post, 0.01, 0]} castShadow>
        <boxGeometry args={[0.024, 0.06, 0.024]} />
        <meshPhongMaterial color={on ? '#f3821d' : '#4a5260'} shininess={20} />
      </mesh>

      <mesh position={[post, 0.01, 0]} castShadow>
        <boxGeometry args={[0.016, 0.05, 0.016]} />
        <meshPhongMaterial color="#3a424d" shininess={20} />
      </mesh>

      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0035, 0.0035, post * 2, 8]} />
        <meshBasicMaterial color={beam} transparent opacity={on ? 0.95 : 0.25} />
      </mesh>
    </group>
  );
}

/**
 * Площадка зоны с контуром: без контура она сливается со столешницей под углом.
 *
 * Геометрия контура живёт в памяти между рендерами намеренно. В аргументах
 * примитива R3F сравнивает по ссылке, и свежий `PlaneGeometry` заставлял бы
 * пересобирать буферы на видеокарте каждый рендер — а во время показа точки
 * рендеры идут потоком, по одному на каждое движение ползунка.
 */
function ZonePatch({ zone }: { zone: Zone }) {
  const edges = useMemo(
    () => new EdgesGeometry(new PlaneGeometry(zone.size.x, zone.size.y)),
    [zone.size.x, zone.size.y],
  );

  return (
    <group position={toScene({ ...zone.position, z: 0.002 })}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[zone.size.x, zone.size.y]} />
        <meshBasicMaterial color="#7c8798" transparent opacity={0.4} side={DoubleSide} />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} geometry={edges}>
        <lineBasicMaterial color="#aab4c2" />
      </lineSegments>
    </group>
  );
}
