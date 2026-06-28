/**
 * Testes do núcleo de estradas (ADR-0072): spline Catmull-Rom (passa pelos nós,
 * tangente coerente) e a malha-faixa (ribbon: largura correta, UV por distância,
 * topologia válida) + resolução de superfície.
 */
import { describe, it, expect } from 'vitest';
import { sampleSpline, splineLength, type Vec3 } from '../../src/road/RoadSpline.js';
import { roadRibbon, toRoadGeometry } from '../../src/road/RoadMesh.js';
import { resolveSurface, ROAD_SURFACES, resolveMarking, ROAD_MARKINGS } from '../../src/road/surfaces.js';
import { Mesh } from 'three';
import { Scene } from '../../src/core/Scene.js';
import { buildScene } from '../../src/scene/SceneBuilder.js';
import type { SceneDefinition } from '../../src/scene/SceneDefinition.js';

const line: Vec3[] = [
  [0, 0, 0],
  [0, 0, 10],
  [0, 0, 20],
];

describe('sampleSpline (Catmull-Rom)', () => {
  it('passa pelos nós de controle (extremos exatos)', () => {
    const s = sampleSpline(line, 8);
    expect(s[0]!.pos).toEqual([0, 0, 0]);
    expect(s[s.length - 1]!.pos[2]).toBeCloseTo(20);
  });

  it('tessellation adaptativa: curva fechada gera MAIS amostras que reta de mesmo tamanho', () => {
    const straight = sampleSpline([[0, 0, 0], [0, 0, 10], [0, 0, 20]], 16);
    const curve = sampleSpline([[0, 0, 0], [10, 0, 10], [0, 0, 20]], 16); // "S"/cotovelo
    expect(curve.length).toBeGreaterThan(straight.length);
  });

  it('reta longa ainda é amostrada (segue o terreno, ~1 a cada 3 m)', () => {
    const s = sampleSpline([[0, 0, 0], [0, 0, 40]], 16);
    expect(s.length).toBeGreaterThanOrEqual(12); // 40 m / 3 ≈ 14
  });

  it('tangente aponta ao longo da reta (+Z)', () => {
    const s = sampleSpline(line, 8);
    const mid = s[Math.floor(s.length / 2)]!;
    expect(mid.tangent[2]).toBeGreaterThan(0.9);
    expect(Math.abs(mid.tangent[0])).toBeLessThan(0.1);
  });

  it('comprimento ~ soma das distâncias (reta de 20 m)', () => {
    expect(splineLength(sampleSpline(line, 16))).toBeCloseTo(20, 1);
  });

  it('degenerado (1 nó) não quebra', () => {
    expect(sampleSpline([[1, 2, 3]], 8)).toHaveLength(1);
  });
});

describe('roadRibbon', () => {
  it('2 vértices por amostra, largura correta', () => {
    const s = sampleSpline(line, 4);
    const r = roadRibbon(s, 8);
    expect(r.positions.length).toBe(s.length * 2 * 3);
    // 1ª amostra: esquerda x=-4, direita x=+4 (reta em +Z → right = +X)
    expect(r.positions[0]).toBeCloseTo(-4); // left x
    expect(r.positions[3]).toBeCloseTo(4); // right x
  });

  it('UV: U atravessa 0..1 na largura; V cresce com a distância', () => {
    const s = sampleSpline(line, 4);
    const r = roadRibbon(s, 8, 8);
    expect(r.uvs[0]).toBe(0); // U esquerda
    expect(r.uvs[2]).toBe(1); // U direita
    // V no fim = comprimento/uvScale = 20/8 = 2.5
    const lastV = r.uvs[r.uvs.length - 1];
    expect(lastV).toBeCloseTo(2.5, 1);
  });

  it('índices: 2 triângulos por quad entre amostras', () => {
    const s = sampleSpline(line, 4);
    const r = roadRibbon(s, 8);
    expect(r.indices.length).toBe((s.length - 1) * 6);
    const maxIdx = Math.max(...r.indices);
    expect(maxIdx).toBeLessThan(s.length * 2);
  });

  it('toRoadGeometry monta atributos coerentes', () => {
    const g = toRoadGeometry(sampleSpline(line, 4), 8);
    expect(g.getAttribute('position').count).toBe(g.getAttribute('uv').count);
    expect(g.getIndex()!.count % 3).toBe(0);
  });
});

describe('nó road no buildScene', () => {
  it('instancia uma estrada (Mesh com cortexRoad)', async () => {
    const scene = new Scene();
    const def: SceneDefinition = {
      version: 1,
      nodes: [
        { type: 'road', id: 'r1', nodes: [[0, 0, 0], [0, 0, 10], [5, 0, 20]], surface: 'asphalt', conformTerrain: false },
      ],
    };
    const handle = await buildScene(scene, def);
    const obj = handle.byId.get('r1');
    expect(obj).toBeInstanceOf(Mesh);
    const cr = (obj!.userData as Record<string, unknown>)['cortexRoad'] as { width: number; nodes: unknown[] };
    expect(cr.nodes).toHaveLength(3);
    expect(cr.width).toBe(8);
    expect((obj!.userData as Record<string, unknown>)['cortexSceneNode']).toBe(true);
    // geometria gerada (ribbon)
    expect((obj as Mesh).geometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('nó road cutfill: terreno se adapta à pista (ADR-0072 Fase 2)', () => {
  it('molda o terreno ao greide SEM destruir a base (heightmap autorado intacto)', async () => {
    const scene = new Scene();
    const n = 9; // res 8 → 81 vértices
    const heights = new Array(n * n).fill(0);
    const center = 4 * n + 4; // (0,0) num terreno 20×20 res 8
    heights[center] = 6; // bossa de 6 m bem no caminho da estrada
    const def: SceneDefinition = {
      version: 1,
      nodes: [
        { type: 'terrain', id: 'chao', size: 20, resolution: 8 },
        // estrada cruzando a bossa ao longo de X, no modo cutfill
        { type: 'road', id: 'via', nodes: [[-10, 0, 0], [0, 0, 0], [10, 0, 0]], width: 8, terrainMode: 'cutfill' },
      ],
    };
    const overlay = { version: 1 as const, objects: {}, data: { terrain: { chao: heights } } };
    const handle = await buildScene(scene, def, { overlay });
    const terrain = (handle.byId.get('chao')!.userData as Record<string, unknown>)['cortexTerrain'] as {
      getHeights(): number[];
      heightAt(x: number, z: number): number | null;
    };
    // NÃO-destrutivo: a base autorada (serialização) continua com a bossa de 6.
    expect(terrain.getHeights()[center]).toBe(6);
    // Mas o terreno EFETIVO sob a pista foi cortado pro greide (bem abaixo de 6).
    expect(terrain.heightAt(0, 0)!).toBeLessThan(6);
    // A estrada guardou o eixo+greide pro post-pass (centerline).
    const cr = (handle.byId.get('via')!.userData as Record<string, unknown>)['cortexRoad'] as {
      terrainMode: string; centerline?: unknown[];
    };
    expect(cr.terrainMode).toBe('cutfill');
    expect(Array.isArray(cr.centerline)).toBe(true);
  });

  it('maxSlope alto = estrada SOBE o morro (corta menos que maxSlope baixo)', async () => {
    const n = 9;
    const buildOver = async (maxSlope: number): Promise<number> => {
      const heights = new Array(n * n).fill(0);
      // rampa subindo ao longo de Z (morro): cada linha mais alta que a anterior
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = j * 1.5;
      const def: SceneDefinition = {
        version: 1,
        nodes: [
          { type: 'terrain', id: 'chao', size: 20, resolution: 8 },
          // estrada subindo a rampa (ao longo de Z), modo cutfill
          { type: 'road', id: 'via', nodes: [[0, 0, -10], [0, 0, 0], [0, 0, 10]], width: 6, terrainMode: 'cutfill', maxSlope },
        ],
      };
      const overlay = { version: 1 as const, objects: {}, data: { terrain: { chao: heights } } };
      const handle = await buildScene(new Scene(), def, { overlay });
      const terrain = (handle.byId.get('chao')!.userData as Record<string, unknown>)['cortexTerrain'] as {
        getHeights(): number[]; heightAt(x: number, z: number): number | null;
      };
      // quanto o terreno EFETIVO sob a pista difere da base (no topo da rampa, z≈+8)
      const base = terrain.getHeights()[8 * n + 4]!; // canto alto da rampa
      const eff = terrain.heightAt(0, 8)!;
      return Math.abs(eff - base); // corte/aterro aplicado ali
    };
    const cutGentle = await buildOver(0.08); // greide manso → achata o morro (corta muito)
    const cutSteep = await buildOver(0.6); // greide acompanha a rampa → corta pouco
    expect(cutSteep).toBeLessThan(cutGentle);
  });
});

describe('marcação de pista (overlay — ADR-0076)', () => {
  it('resolveMarking: nome embutido → textura em Markers/; undefined → null', () => {
    expect(resolveMarking('dashed')).toEqual(ROAD_MARKINGS.dashed);
    expect(resolveMarking('dashed')!.url).toContain('assets/roads/Markers/');
    expect(resolveMarking(undefined)).toBeNull();
  });
  it('resolveMarking: nome desconhecido → null; URL explícita preserva', () => {
    expect(resolveMarking('xyz' as never)).toBeNull();
    expect(resolveMarking({ url: 'm.png' })).toEqual({ url: 'm.png', repeat: 12 });
  });

  it('buildScene: com markings cria um overlay filho (cortexRoadMarkings)', async () => {
    const scene = new Scene();
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'road', id: 'r1', nodes: [[0, 0, 0], [0, 0, 10], [0, 0, 20]], conformTerrain: false, markings: 'dashed' }],
    };
    const handle = await buildScene(scene, def);
    const road = handle.byId.get('r1') as Mesh;
    const overlay = road.children.find((c) => (c.userData as Record<string, unknown>)['cortexRoadMarkings']) as Mesh;
    expect(overlay).toBeInstanceOf(Mesh);
    // overlay tem a mesma topologia da pista (clone) e fica ACIMA dela (epsilon em Y)
    expect(overlay.geometry.getAttribute('position').count).toBe(road.geometry.getAttribute('position').count);
    expect(overlay.geometry.getAttribute('position').getY(0)).toBeGreaterThan(road.geometry.getAttribute('position').getY(0));
    expect((overlay.material as { transparent: boolean }).transparent).toBe(true);
  });

  it('buildScene: sem markings NÃO cria overlay', async () => {
    const def: SceneDefinition = {
      version: 1,
      nodes: [{ type: 'road', id: 'r2', nodes: [[0, 0, 0], [0, 0, 10]], conformTerrain: false }],
    };
    const handle = await buildScene(new Scene(), def);
    const road = handle.byId.get('r2') as Mesh;
    expect(road.children.some((c) => (c.userData as Record<string, unknown>)['cortexRoadMarkings'])).toBe(false);
  });
});

describe('resolveSurface', () => {
  it('nome embutido resolve diffuse/normal', () => {
    expect(resolveSurface('asphalt')).toEqual(ROAD_SURFACES.asphalt);
  });
  it('undefined cai no asfalto', () => {
    expect(resolveSurface(undefined)).toEqual(ROAD_SURFACES.asphalt);
  });
  it('config explícita preserva URLs e defaults', () => {
    const r = resolveSurface({ diffuse: 'x.png' });
    expect(r.diffuse).toBe('x.png');
    expect(r.repeat).toBe(8);
  });
});
