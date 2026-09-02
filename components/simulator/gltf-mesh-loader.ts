'use client';

import { Mesh, type Material, type Object3D } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type URDFLoader from 'urdf-loader';

/**
 * Загрузка мешей робота в формате glTF со сжатием Draco.
 *
 * `urdf-loader` из коробки понимает только STL и DAE, а меши мы публикуем в glTF
 * (`scripts/convert-meshes.ts`): исходные STL из ROS-пакетов весят мегабайты,
 * после Draco — десятки килобайт. Всё остальное отдаём штатному загрузчику.
 */

/** Декодер лежит в `public/draco`, его кладёт туда `scripts/sync-draco.ts` на postinstall. */
const DECODER_PATH = '/draco/';

type MeshLoadFunc = URDFLoader['loadMeshCb'];

let decoder: DRACOLoader | null = null;

function getDecoder(): DRACOLoader {
  // Декодер тянет за собой wasm и пул воркеров — заводим один на всё приложение.
  decoder ??= new DRACOLoader().setDecoderPath(DECODER_PATH);
  return decoder;
}

/**
 * Оборачивает штатный загрузчик мешей: glTF берёт на себя, остальное передаёт дальше.
 * Так плагин модели может смешивать форматы, а вьюер об этом не знает.
 */
export function withGltfSupport(fallback: MeshLoadFunc): MeshLoadFunc {
  return (url, manager, material, onLoad) => {
    if (!/\.(glb|gltf)$/i.test(url)) {
      fallback(url, manager, material, onLoad);
      return;
    }

    new GLTFLoader(manager).setDRACOLoader(getDecoder()).load(
      url,
      (gltf) => {
        // Меши конвертируются без материалов, цвет приходит из <material> в URDF.
        if (material !== null) applyMaterial(gltf.scene, material);
        onLoad(gltf.scene);
      },
      undefined,
      (error: unknown) => {
        // Типы urdf-loader обещают Object3D, но его собственный defaultMeshLoader
        // в ветке ошибки передаёт null, а вызывающий код сначала смотрит на err.
        const report = onLoad as (mesh: Object3D | null, error: Error) => void;
        report(null, error instanceof Error ? error : new Error(String(error)));
      },
    );
  };
}

function applyMaterial(root: Object3D, material: Material): void {
  root.traverse((object) => {
    if (object instanceof Mesh) object.material = material;
  });
}
