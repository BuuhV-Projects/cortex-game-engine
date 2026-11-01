/**
 * Peças da ponte (SPEC-0631 §3d): pista repetida fechando o vão, pilar esticado até o
 * chão nas juntas, guarda-corpo nas duas bordas. `loadGLB` devolve caixas de tamanho
 * conhecido (pista 10 m, pilar 4 m de altura, guarda-corpo 2 m).
 */
import { describe, it, expect, vi } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3, type Object3D } from 'three';
import type { GradePoint } from '../../src/road/RoadGrade.js';

/** Caixa com o contrato de origem: `top` = topo em y = 0, senão base em y = 0. */
function box(w: number, h: number, l: number, top: boolean): Group {
  const g = new Group();
  const m = new Mesh(new BoxGeometry(w, h, l), new MeshBasicMaterial());
  m.position.y = top ? -h / 2 : h / 2;
  g.add(m);
  return g;
}
const MODELS: Record<string, () => Group> = {
  deck: () => box(10, 1, 10, true),
  pillar: () => box(1, 4, 1, true),
  rail: () => box(0.1, 1, 2, false),
};
vi.mock('../../src/scene/SceneAssets.js', () => ({
  loadGLB: async (url: string) => {
    if (!MODELS[url]) throw new Error('404 ' + url);
    return { scene: MODELS[url]!(), animations: [] };
  },
  instance: (gltf: { scene: Object3D }) => gltf.scene,
}));

const { buildBridgeParts, bridgeSpans } = await import('../../src/scene/RoadBridgeParts.js');

/** Eixo reto em X de 0 a 60 a 20 m de altura; vão de x = 10 a 50 (40 m). */
const line: GradePoint[] = Array.from({ length: 61 }, (_, x) => ({ x, z: 0, y: 20, bridge: x >= 10 && x <= 50 }));
const parts = (o: Object3D): Object3D[] => o.getObjectByName('cortexRoadBridgeParts')?.children ?? [];

describe('peças da ponte', () => {
  it('bridgeSpans junta os pontos contínuos do vão', () => {
    expect(bridgeSpans(line)).toHaveLength(1);
    expect(bridgeSpans(line)[0]).toHaveLength(41);
  });

  it('pista fecha o vão, pilar nas juntas até o chão, guarda-corpo nas bordas', async () => {
    const road = new Mesh();
    await buildBridgeParts(road, { deck: 'deck', pillar: 'pillar', rail: 'rail', pillarEvery: 2 }, line, 8, () => 0);
    const all = parts(road);
    // 40 m / 10 m = 4 peças de pista; juntas internas 1,2,3 → pilar a cada 2 = só a junta 2 (x = 30).
    const decks = all.filter((o) => o.scale.y === 1 && Math.abs(o.position.z) < 1e-6);
    expect(decks).toHaveLength(4);
    const pillars = all.filter((o) => o.scale.y > 1);
    expect(pillars).toHaveLength(1);
    expect(pillars[0]!.position.x).toBeCloseTo(30, 5);
    pillars[0]!.updateMatrixWorld(true);
    const pb = new Box3().setFromObject(pillars[0]!);
    expect(pb.max.y).toBeCloseTo(20, 4); // topo no greide
    expect(pb.min.y).toBeCloseTo(0, 4); // pé no chão
    const rails = all.filter((o) => Math.abs(o.position.z) > 1);
    expect(rails).toHaveLength(2 * 20); // 40 m / 2 m, nas duas bordas
    expect(new Set(rails.map((o) => Math.round(o.position.z)))).toEqual(new Set([4, -4]));
  });

  it('sem bridgeParts (ou sem vão) remove as peças; modelo que falha é ignorado', async () => {
    const road = new Mesh();
    await buildBridgeParts(road, { deck: 'deck' }, line, 8, () => 0);
    expect(parts(road).length).toBe(4);
    await buildBridgeParts(road, undefined, line, 8, () => 0);
    expect(road.getObjectByName('cortexRoadBridgeParts')).toBeUndefined();
    await buildBridgeParts(road, { deck: 'nao-existe', rail: 'rail' }, line, 8, () => 0);
    expect(parts(road).length).toBe(40);
  });

  it('pista inclinada acompanha a rampa do vão', async () => {
    const ramp: GradePoint[] = Array.from({ length: 21 }, (_, x) => ({ x, z: 0, y: x * 0.1, bridge: true }));
    const road = new Mesh();
    await buildBridgeParts(road, { deck: 'deck' }, ramp, 8, () => null);
    const [deck] = parts(road);
    deck!.updateMatrixWorld(true);
    const fwd = new Vector3(0, 0, 1).transformDirection(deck!.matrixWorld);
    expect(fwd.y / Math.hypot(fwd.x, fwd.z)).toBeCloseTo(0.1, 4);
  });
});
