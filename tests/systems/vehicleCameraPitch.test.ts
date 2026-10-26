import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { VehicleControlSystem } from '../../src/systems/VehicleControlSystem.js';

/** SPEC-0293: a chase cam começa na inclinação de `camPitch`. */
function cameraAt(options: { camDistance: number; camHeight: number; camPitch?: number }) {
  const camera = new PerspectiveCamera();
  const system = new VehicleControlSystem(
    {} as never, { forwardSpeed: () => 0 } as never, {} as never, camera,
    { getAxis: () => 0 } as never, undefined, options,
  );
  (system as unknown as { placeCamera: (t: object, r: object, dt: number) => void })
    .placeCamera({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 0.016);
  return camera.position;
}

describe('camPitch da chase cam (SPEC-0293)', () => {
  it('com camPitch 0 fica exatamente em distância × altura', () => {
    const p = cameraAt({ camDistance: 20, camHeight: 8, camPitch: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(8);
    expect(p.z).toBeCloseTo(-20);
  });

  it('sem camPitch mantém a inclinação padrão de 0,32 rad', () => {
    const p = cameraAt({ camDistance: 20, camHeight: 6 });
    expect(p.y).toBeCloseTo(6 + 20 * Math.sin(0.32));
  });
});

describe('camPitch ao vivo (SPEC-0595)', () => {
  it('trocar options.camPitch depois do 1º quadro reaplica a inclinação', () => {
    const camera = new PerspectiveCamera();
    const options: { camDistance: number; camHeight: number; camPitch?: number } = { camDistance: 20, camHeight: 6 };
    const system = new VehicleControlSystem(
      {} as never, { forwardSpeed: () => 0 } as never, {} as never, camera,
      { getAxis: () => 0 } as never, undefined, options,
    );
    const place = () => (system as unknown as { placeCamera: (t: object, r: object, dt: number) => void })
      .placeCamera({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 0.016);
    place(); // a chase cam inicializou na padrão (0,32 rad), antes do jogo escolher a dele
    expect(camera.position.y).toBeCloseTo(6 + 20 * Math.sin(0.32));
    options.camPitch = 0;
    place();
    expect(camera.position.y).toBeCloseTo(6);
  });
});
