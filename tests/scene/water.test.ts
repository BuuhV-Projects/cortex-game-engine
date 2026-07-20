/**
 * Testes da água (src/scene/Water.ts): o mar "infinito" que segue a câmera pra a
 * borda quadrada do plano finito sumir atrás do fog, e a ancoragem das cáusticas
 * ao mundo (elas não escorregam junto com o plano).
 */
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Texture } from 'three';
import { Water } from '../../src/scene/Water.js';
import { Scene } from '../../src/core/Scene.js';

/** Injeta uma textura de cáusticas "pronta" (o load real é assíncrono). */
function withCaustics(water: Water): Texture {
  const tex = new Texture();
  (water as unknown as { map: Texture }).map = tex;
  return tex;
}

describe('Water — mar infinito (follow)', () => {
  it('sem câmera: o plano fica fixo no XZ após o update', () => {
    const water = new Water(new Scene(), { y: -6 });
    water.update(0.016);
    expect(water.mesh.position.x).toBe(0);
    expect(water.mesh.position.z).toBe(0);
    expect(water.mesh.position.y).toBe(-6);
  });

  it('com câmera: re-centra no XZ da câmera preservando o Y', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(120, 8, -45);
    const water = new Water(new Scene(), { y: -6, camera });
    water.update(0.016);
    expect(water.mesh.position.x).toBe(120);
    expect(water.mesh.position.z).toBe(-45);
    expect(water.mesh.position.y).toBe(-6); // altura da superfície não muda
  });

  it('follow:false com câmera: continua fixo (lago/poça)', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(120, 8, -45);
    const water = new Water(new Scene(), { y: -6, camera, follow: false });
    water.update(0.016);
    expect(water.mesh.position.x).toBe(0);
    expect(water.mesh.position.z).toBe(0);
  });

  it('cáusticas ancoradas ao mundo: a UV compensa a posição do plano (em tiles)', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(100, 0, 50);
    // size 400 / repeat 8 = 50 unidades por tile. flowSpeed 0 isola a compensação.
    const water = new Water(new Scene(), {
      camera,
      size: 400,
      repeat: 8,
      causticsUrl: 'x.png',
      flowSpeed: [0, 0],
    });
    const tex = withCaustics(water);
    water.update(0.016);
    // u = flow(0) + camX/tile = 100/50 = 2 ; v = flow(0) - camZ/tile = -50/50 = -1
    expect(tex.offset.x).toBeCloseTo(2, 6);
    expect(tex.offset.y).toBeCloseTo(-1, 6);
  });
});
