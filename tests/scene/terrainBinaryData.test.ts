/**
 * SPEC-0728 — terreno com dados binários: `setPaint` com os bytes RGBA crus (sem base64) e alturas como array tipado
 * no construtor, no `setHeights` e no nó `terrain` da cena.
 */
import { describe, it, expect } from 'vitest';
import type { Mesh } from 'three';
import { Terrain } from '../../src/scene/Terrain.js';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import { parseSceneNode, type SceneDefinition } from '../../src/scene/SceneDefinition.js';

const SIZE = 4;
const RGBA = 4;
const LAYERS = [{ url: 'assets/a.png', repeat: 2 }];
/** Pesos RGBA com um padrão que ocupa todos os bytes. */
const pattern = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
const splatBytes = (t: Terrain): Uint8Array => new Uint8Array(Buffer.from(t.getPaint()!.splat, 'base64'));

describe('setPaint com bytes (SPEC-0728)', () => {
  it('bytes crus dão o mesmo splatmap que o base64', () => {
    const bytes = pattern(SIZE * SIZE * RGBA);
    const viaBase64 = new Terrain({ size: 10, resolution: 4 });
    viaBase64.setPaint({ layers: LAYERS, size: SIZE, splat: Buffer.from(bytes).toString('base64') });
    const viaBytes = new Terrain({ size: 10, resolution: 4 });
    viaBytes.setPaint({ layers: LAYERS, size: SIZE, splat: bytes });
    expect(splatBytes(viaBytes)).toEqual(bytes);
    expect(viaBytes.getPaint()).toEqual(viaBase64.getPaint());
  });

  it('copia os bytes: mexer no buffer depois não muda o terreno', () => {
    const bytes = pattern(SIZE * SIZE * RGBA);
    const t = new Terrain({ size: 10, resolution: 4 });
    t.setPaint({ layers: LAYERS, size: SIZE, splat: bytes });
    const before = splatBytes(t);
    bytes.fill(0);
    expect(splatBytes(t)).toEqual(before);
  });

  it('mais bytes que o splatmap: o excesso é ignorado; menos: o resto fica como estava', () => {
    const n = SIZE * SIZE * RGBA;
    const t = new Terrain({ size: 10, resolution: 4 });
    t.setPaint({ layers: LAYERS, size: SIZE, splat: pattern(n + 64) });
    expect(splatBytes(t)).toEqual(pattern(n));
    t.setPaint({ layers: LAYERS, size: SIZE, splat: new Uint8Array(RGBA) });
    const after = splatBytes(t);
    expect([...after.subarray(0, RGBA)]).toEqual([0, 0, 0, 0]);
    expect(after.subarray(RGBA)).toEqual(pattern(n).subarray(RGBA));
  });

  it('bytes vazios ou sem camada não pintam', () => {
    const t = new Terrain({ size: 10, resolution: 4 });
    t.setPaint({ layers: LAYERS, size: SIZE, splat: new Uint8Array(0) });
    t.setPaint({ layers: [], size: SIZE, splat: pattern(SIZE * SIZE * RGBA) });
    expect(t.getPaint()).toBeNull();
  });
});

describe('alturas como array tipado (SPEC-0728)', () => {
  const n = 5 * 5; // resolution 4
  const ramp = (k: number): number[] => Array.from({ length: k }, (_, i) => i * 0.5);

  it('construtor e setHeights aceitam Float32Array e Float64Array', () => {
    expect(new Terrain({ size: 10, resolution: 4, heights: Float32Array.from(ramp(n)) }).getHeights()).toEqual(ramp(n));
    const t = new Terrain({ size: 10, resolution: 4 });
    t.setHeights(Float64Array.from(ramp(n)));
    expect(t.getHeights()).toEqual(ramp(n));
  });

  it('array maior que a grade: copia só (res+1)²; menor: o resto fica', () => {
    const t = new Terrain({ size: 10, resolution: 4, heights: Float64Array.from(ramp(n + 10)) });
    expect(t.getHeights()).toEqual(ramp(n));
    t.setHeights([9, 9]);
    expect(t.getHeights()).toEqual([9, 9, ...ramp(n).slice(2)]);
    t.setHeights(ramp(n + 3));
    expect(t.getHeights()).toEqual(ramp(n));
  });

  it('o nó terrain da cena aceita e valida as alturas tipadas', async () => {
    const heights = Float64Array.from(ramp(n));
    expect(parseSceneNode({ type: 'terrain', id: 'chao', size: 10, resolution: 4, heights })).not.toBeNull();
    const def: SceneDefinition = { version: 1, nodes: [{ type: 'terrain', id: 'chao', size: 10, resolution: 4, heights }] };
    const handle = await buildScene(new Scene(), def);
    const terrain = (handle.byId.get('chao') as Mesh).userData['cortexTerrain'] as Terrain;
    expect(terrain.getHeights()).toEqual(ramp(n));
  });
});
