/**
 * Testes do Terrain (terreno horizontal esculpível, ADR): grade XZ, heightmap,
 * sculpt com falloff (centro sobe mais que a borda), serialização e o nó da cena.
 */
import { describe, it, expect } from 'vitest';
import { Mesh, Float32BufferAttribute } from 'three';
import { Terrain } from '../../src/scene/Terrain.js';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

describe('Terrain', () => {
  it('cria uma grade plana (res+1)² com mesh e heightmap zerado', () => {
    const t = new Terrain({ size: 10, resolution: 4 });
    expect(t.mesh).toBeInstanceOf(Mesh);
    const n = 5; // res+1
    expect(t.getHeights()).toHaveLength(n * n);
    expect(t.getHeights().every((h) => h === 0)).toBe(true);
    // controlador acessível pelo userData (o editor esculpe por aqui)
    expect(t.mesh.userData['cortexTerrain']).toBe(t);
  });

  it('sculpt levanta a altura com falloff (centro > borda do pincel) e mexe no mesh', () => {
    const t = new Terrain({ size: 20, resolution: 20 }); // vértice a cada 1u
    const changed = t.sculpt(0, 0, 5, 4); // raio 5, sobe 4 no centro
    expect(changed).toBe(true);
    const n = t.resolution + 1;
    const center = (n * n - 1) / 2; // vértice central (grade ímpar)
    const heights = t.getHeights();
    expect(heights[center]).toBeGreaterThan(0); // centro subiu
    // a posição Y do mesh acompanha o heightmap
    const pos = t.mesh.geometry.getAttribute('position') as Float32BufferAttribute;
    expect(pos.getY(center)).toBeCloseTo(heights[center]!);
    // falloff: o centro sobe MAIS que um vértice perto da borda do pincel
    const edgeIdx = Math.round(t.resolution / 2) * n + (Math.round(t.resolution / 2) + 4); // ~4u do centro
    expect(heights[center]!).toBeGreaterThan(heights[edgeIdx]!);
    expect(heights[edgeIdx]!).toBeGreaterThan(0);
  });

  it('delta negativo abaixa; fora do raio não muda', () => {
    const t = new Terrain({ size: 20, resolution: 20 });
    t.sculpt(0, 0, 3, -2);
    const n = t.resolution + 1;
    const center = (n * n - 1) / 2;
    expect(t.getHeights()[center]).toBeLessThan(0);
    // um vértice longe do pincel (canto) ficou em 0
    expect(t.getHeights()[0]).toBe(0);
  });

  it('getHeights/setHeights faz round-trip (persistência)', () => {
    const a = new Terrain({ size: 10, resolution: 4 });
    a.sculpt(0, 0, 6, 3);
    const saved = a.getHeights();
    const b = new Terrain({ size: 10, resolution: 4 });
    b.setHeights(saved);
    expect(b.getHeights()).toEqual(saved);
  });

  it('buildScene instancia o nó terrain e restaura heights do overlay', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'terrain', id: 'chao', size: 10, resolution: 4 }],
    };
    const heights = new Array(25).fill(0);
    heights[12] = 5; // pico no centro
    const overlay = { version: 1 as const, objects: {}, data: { terrain: { chao: heights } } };
    const handle = await buildScene(new Scene(), def, { overlay });
    const mesh = handle.byId.get('chao') as Mesh;
    const terrain = mesh.userData['cortexTerrain'] as Terrain;
    expect(terrain.getHeights()[12]).toBe(5); // overlay restaurado
  });
});
