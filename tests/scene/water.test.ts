/**
 * Testes da água (src/scene/Water.ts): o mar "infinito" que segue a câmera pra a
 * borda quadrada do plano finito sumir atrás do fog, e a ancoragem das cáusticas
 * ao mundo (elas não escorregam junto com o plano).
 */
import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Texture } from 'three';
import { Water } from '../../src/scene/Water.js';
import { WaterRipples, WATER_RIPPLE_CAPACITY, WATER_RIPPLE_LIFETIME } from '../../src/scene/WaterRipples.js';
import { CartoonWaterMaterial } from '../../src/scene/CartoonWaterMaterial.js';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { parseSceneDefinition } from '../../src/scene/SceneDefinition.js';

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

describe('Water — modo cartoon', () => {
  it('carrega opções do JSON e acompanha a câmera pelo atualizador da cena', async () => {
    const node = { type: 'water', id: 'water-test01', style: 'cartoon', segments: 16,
      y: -2, waveHeight: .3, waveLength: 20, waveSpeed: .8, foamStrength: .6 };
    const definition = parseSceneDefinition({ version: 1, nodes: [node] });
    expect(definition).not.toBeNull();
    expect(parseSceneDefinition({ version: 1, nodes: [{ ...node, segments: 300 }] })).toBeNull();
    expect(parseSceneDefinition({ version: 1, nodes: [{ ...node, foamStrength: 2 }] })).toBeNull();
    const camera = new PerspectiveCamera();
    camera.position.set(40, 10, -20);
    const handle = await buildScene(new Scene(), definition!, { camera });
    handle.update(.5);
    const mesh = handle.byId.get(node.id)!;
    expect(mesh.position.toArray()).toEqual([40, -2, -20]);
    expect(mesh.userData.cortexWater).toBe(true);
  });

  it('cria geometria horizontal subdividida, com limites que incluem as ondas', () => {
    const water = new Water(new Scene(), { style: 'cartoon', segments: 16, waveHeight: .4 });
    expect(water.mesh.geometry.attributes.position.count).toBe(17 * 17);
    expect(water.mesh.rotation.x).toBe(0);
    expect(water.mesh.geometry.boundingBox!.min.y).toBeCloseTo(-.4);
    expect(water.mesh.geometry.boundingBox!.max.y).toBeCloseTo(.4);
    expect(water.mesh.userData.cortexWater).toBe(true);
    expect(water.mesh.castShadow).toBe(false);
    water.dispose();
    expect(water.mesh.parent).toBeNull();
  });

  it('mantém o material e o pool ao avançar o relógio, inclusive sem textura', () => {
    const surface = new CartoonWaterMaterial({});
    const originalMaterial = surface.material;
    const originalSlots = [...surface.ripples.values];
    surface.ripples.add(10, -20, 1);
    surface.update(.5);
    expect(surface.clock.value).toBe(.5);
    expect(surface.ripples.values[0].toArray()).toEqual([10, -20, .5, 1]);
    expect(surface.material).toBe(originalMaterial);
    surface.ripples.values.forEach((slot, index) => expect(slot).toBe(originalSlots[index]));
    surface.material.dispose();
  });

  it('exige parâmetros finitos e limita o orçamento de subdivisões', () => {
    expect(() => new Water(new Scene(), { style: 'cartoon', waveLength: 0 })).toThrow(RangeError);
    expect(() => new Water(new Scene(), { style: 'cartoon', segments: 1024 })).toThrow(RangeError);
    expect(() => new Water(new Scene(), { style: 'cartoon', waveHeight: NaN })).toThrow(RangeError);
    expect(() => new Water(new Scene(), { style: 'cartoon', foamWidth: 0 })).toThrow(RangeError);
  });

  it('oferece perturbações somente no modo cartoon', () => {
    const simple = new Water(new Scene());
    const cartoon = new Water(new Scene(), { style: 'cartoon' });
    expect(simple.addRipple({ x: 0, z: 0 })).toBe(false);
    expect(cartoon.addRipple({ x: 0, z: 0 })).toBe(true);
    simple.dispose();
    cartoon.dispose();
  });
});

describe('WaterRipples — perturbações locais', () => {
  it('reutiliza o slot mais antigo e expira os eventos', () => {
    const pool = new WaterRipples();
    const firstSlot = pool.values[0];
    for (let index = 0; index <= WATER_RIPPLE_CAPACITY; index++) pool.add(index, -index, 1);
    expect(pool.values).toHaveLength(WATER_RIPPLE_CAPACITY);
    expect(pool.values[0]).toBe(firstSlot);
    expect(firstSlot.x).toBe(WATER_RIPPLE_CAPACITY);
    pool.update(WATER_RIPPLE_LIFETIME);
    expect(pool.values.every(slot => slot.w === 0)).toBe(true);
  });

  it('mantém centros no mundo e recusa entradas que contaminariam os uniforms', () => {
    const pool = new WaterRipples();
    pool.add(12, -4, 2);
    pool.update(-1);
    pool.update(NaN);
    expect(pool.values[0].toArray()).toEqual([12, -4, 0, 1]);
    expect(() => pool.add(Infinity, 0, 1)).toThrow(RangeError);
    expect(() => pool.add(0, 0, -1)).toThrow(RangeError);
  });
});
