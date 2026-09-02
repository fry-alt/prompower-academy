import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

/**
 * Считает кадры и раз в секунду отдаёт частоту наружу.
 *
 * DoD фазы 1 требует 60 fps на среднем ноутбуке — показатель должен быть виден
 * прямо на странице, а не только в профайлере.
 */
export function FrameRateProbe({ onSample }: { onSample: (fps: number) => void }) {
  const frames = useRef(0);
  const since = useRef(0);

  useFrame((_, delta) => {
    frames.current += 1;
    since.current += delta;
    if (since.current < 1) return;
    onSample(Math.round(frames.current / since.current));
    frames.current = 0;
    since.current = 0;
  });

  return null;
}
