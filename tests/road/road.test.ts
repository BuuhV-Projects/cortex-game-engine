/**
 * Testes do núcleo de estradas (ADR-0072): spline Catmull-Rom (passa pelos nós,
 * tangente coerente) e a malha-faixa (ribbon: largura correta, UV por distância,
 * topologia válida) + resolução de superfície.
 */
import { describe, it, expect } from 'vitest';
import { sampleSpline, splineLength, type Vec3 } from '../../src/road/RoadSpline.js';
import { roadRibbon, toRoadGeometry } from '../../src/road/RoadMesh.js';
import { resolveSurface, ROAD_SURFACES } from '../../src/road/surfaces.js';
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

  it('produz amostras suficientes (steps por segmento)', () => {
    const s = sampleSpline(line, 10);
    // 2 segmentos × 10 + 1 (primeiro nó) = 21
    expect(s.length).toBe(21);
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
