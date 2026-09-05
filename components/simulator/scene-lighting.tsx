'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';

/**
 * Освещение сцены: студийная среда, три источника и контактная тень.
 *
 * Среда собирается из прямоугольных источников прямо здесь, а не скачивается
 * готовой картой: бриф требует загрузки сцены меньше чем за две секунды и не
 * разрешает зависеть от чужой сети. `frames={1}` рендерит её в кубическую карту
 * один раз — источники неподвижны, пересчитывать каждый кадр нечего.
 *
 * Без среды металлу нечего отражать, и настоящая модель читается как серый
 * пластик. Это главное, что делает сцену живой.
 */

export function SceneLighting({ radius }: { radius: number }) {
  const distance = radius * 3;
  // Тень рисует только ключевой источник, и её камера должна охватывать робота
  // целиком с запасом на вылет руки — но не больше, иначе разрешение карты
  // уходит впустую и тень становится мылом.
  const shadowExtent = radius * 1.6;

  return (
    <>
      <Environment resolution={256} frames={1}>
        {/* Верхний мягкий: основной блик по кромкам звеньев. */}
        <Lightformer
          form="rect"
          intensity={2.2}
          position={[0, 5, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[10, 10, 1]}
          color="#ffffff"
        />
        {/* Боковые холодный и тёплый: без разницы температур металл плоский. */}
        <Lightformer
          form="rect"
          intensity={1.4}
          position={[-5, 1, 2]}
          rotation={[0, -Math.PI / 2, 0]}
          scale={[8, 6, 1]}
          color="#9fc4ff"
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          position={[5, 1, -2]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[8, 6, 1]}
          color="#ffd9a8"
        />
      </Environment>

      {/* Заливка приглушена: раньше она несла весь свет, теперь его даёт среда. */}
      <hemisphereLight args={['#8a93a5', '#1a1d22', 0.35]} />

      <directionalLight
        position={[distance, distance * 1.4, distance * 0.6]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-far={distance * 4}
        shadow-bias={-0.0008}
      />

      {/* Контровой: отделяет силуэт от фона, тени не даёт. */}
      <directionalLight
        position={[-distance * 0.8, distance * 0.6, -distance]}
        intensity={0.6}
        color="#b8d4ff"
      />

      {/*
        Контакт со столешницей. Направленная тень одна не даёт ощущения, что
        робот стоит: он выглядит висящим над столом. Поверхность стола на нуле
        по Y, поэтому пятно кладём чуть выше, чтобы не спорить с ней за пиксели.
      */}
      <ContactShadows
        position={[0, 0.001, 0]}
        scale={radius * 3}
        resolution={512}
        blur={2.4}
        opacity={0.55}
        far={radius}
      />
    </>
  );
}
