import { describe, it, expect } from 'vitest';
import { ROAD_PROFILES, getProfile, profileWidth, profileIsDrivable } from '../../src/road/profiles.js';
import { profileMesh } from '../../src/road/roadProfileMesh.js';
import type { RoadSample } from '../../src/road/RoadSpline.js';
import { validateRegion } from '../../src/road/citySpec.js';
import { buildNavGraph, navConnected } from '../../src/road/navGraph.js';

/** Reta ao longo de +Z (tangente [0,0,1] → direita = +X), 3 amostras. */
const straight: RoadSample[] = [
  { pos: [0, 0, 0], tangent: [0, 0, 1] },
  { pos: [0, 0, 10], tangent: [0, 0, 1] },
  { pos: [0, 0, 20], tangent: [0, 0, 1] },
];
const ys = (pos: number[]): number[] => pos.filter((_, i) => i % 3 === 1);
const xs = (pos: number[]): number[] => pos.filter((_, i) => i % 3 === 0);

describe('road/profiles', () => {
  it('largura total = soma das faixas', () => {
    expect(profileWidth(ROAD_PROFILES.residential)).toBe(10);
    expect(profileWidth(ROAD_PROFILES.highway)).toBe(32);
    expect(profileWidth(ROAD_PROFILES.pedestrian_market)).toBe(8);
  });
  it('drivable: rua sim, calçadão não', () => {
    expect(profileIsDrivable(ROAD_PROFILES.residential)).toBe(true);
    expect(profileIsDrivable(ROAD_PROFILES.pedestrian_market)).toBe(false);
  });
  it('getProfile cai em residential se faltar', () => {
    expect(getProfile('inexistente' as never).name).toBe('residential');
  });
});

describe('road/profileMesh (extrusão do perfil)', () => {
  it('residential gera 5 partes: calçada, meio-fio, pista, meio-fio, calçada', () => {
    const parts = profileMesh(straight, ROAD_PROFILES.residential);
    expect(parts.map((p) => p.role)).toEqual(['sidewalk', 'curb', 'roadway', 'curb', 'sidewalk']);
  });
  it('pista é plana (y=0) e centrada (x em [-3,3]); calçada elevada (y=0.15)', () => {
    const parts = profileMesh(straight, ROAD_PROFILES.residential);
    const road = parts[2]!; // roadway
    expect(road.drivable).toBe(true);
    expect(Math.max(...ys(road.ribbon.positions))).toBe(0);
    expect(Math.min(...xs(road.ribbon.positions))).toBe(-3);
    expect(Math.max(...xs(road.ribbon.positions))).toBe(3);
    const sidewalk = parts[0]!;
    expect(Math.max(...ys(sidewalk.ribbon.positions))).toBeCloseTo(0.15, 5);
    expect(sidewalk.walkable).toBe(true);
  });
  it('meio-fio é vertical (sobe de 0 a 0.15 no mesmo x)', () => {
    const curb = profileMesh(straight, ROAD_PROFILES.residential).find((p) => p.role === 'curb')!;
    expect(Math.min(...ys(curb.ribbon.positions))).toBe(0);
    expect(Math.max(...ys(curb.ribbon.positions))).toBeCloseTo(0.15, 5);
  });
  it('cada tira tem 2 vértices por amostra', () => {
    const road = profileMesh(straight, ROAD_PROFILES.residential)[2]!;
    expect(road.ribbon.positions.length).toBe(straight.length * 2 * 3); // 2 verts × 3 floats
  });
  it('calçadão (pedestrian_market) não tem pista dirigível', () => {
    const parts = profileMesh(straight, ROAD_PROFILES.pedestrian_market);
    expect(parts.some((p) => p.drivable)).toBe(false);
    expect(parts.some((p) => p.walkable)).toBe(true);
  });
});

describe('road/citySpec (validação)', () => {
  const baseCity = {
    id: 'c', bounds: [[0, 0], [10, 0], [10, 10]],
    roads: [{ id: 'r1', profile: 'residential', points: [[0, 0], [0, 50]] }],
  };
  it('aceita região válida', () => {
    const res = validateRegion({ name: 'df', size: { x: 100, z: 100 }, cities: [baseCity] });
    expect(res.ok).toBe(true);
    expect(res.spec?.cities[0]!.intersections).toEqual([]); // default preenchido
  });
  it('rejeita cruzamento que referencia via inexistente', () => {
    const res = validateRegion({
      name: 'df', size: { x: 100, z: 100 },
      cities: [{ ...baseCity, intersections: [{ id: 'x', at: [0, 50], roads: ['r1', 'fantasma'], kind: 'cross' }] }],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.message.includes('fantasma'))).toBe(true);
  });
  it('rejeita id de via duplicado', () => {
    const res = validateRegion({
      name: 'df', size: { x: 100, z: 100 },
      cities: [{ ...baseCity, roads: [...baseCity.roads, { id: 'r1', profile: 'alley', points: [[0, 0], [9, 9]] }] }],
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.message.includes('duplicado'))).toBe(true);
  });
});

describe('road/navGraph', () => {
  const region = validateRegion({
    name: 'df', size: { x: 200, z: 200 },
    cities: [{
      id: 'c', bounds: [[0, 0], [60, 0], [60, 60]],
      roads: [
        { id: 'r1', profile: 'residential', points: [[0, 0], [0, 50]] },
        { id: 'r2', profile: 'residential', points: [[0, 50], [50, 50]] }, // compartilha ponta com r1
        { id: 'ped', profile: 'pedestrian_market', points: [[0, 0], [10, 0]] }, // sem aresta (calçadão)
      ],
    }],
  }).spec!;

  it('arestas só de vias dirigíveis; pontas próximas viram o mesmo nó', () => {
    const g = buildNavGraph(region);
    expect(g.edges.length).toBe(2); // r1, r2 (ped excluída)
    expect(g.nodes.length).toBe(3); // [0,0], [0,50] (compartilhado), [50,50]
    expect(navConnected(g)).toBe(true);
  });

  it('via isolada quebra a conectividade', () => {
    const r2 = validateRegion({
      name: 'df', size: { x: 200, z: 200 },
      cities: [{
        id: 'c', bounds: [[0, 0], [60, 0], [60, 60]],
        roads: [
          { id: 'r1', profile: 'residential', points: [[0, 0], [0, 50]] },
          { id: 'solta', profile: 'residential', points: [[180, 180], [180, 190]] },
        ],
      }],
    }).spec!;
    expect(navConnected(buildNavGraph(r2))).toBe(false);
  });
});
