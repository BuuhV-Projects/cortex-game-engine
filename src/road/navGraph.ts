import type { Vec2, RegionSpec, RoadSpec } from './citySpec.js';
import { getProfile, type RoadProfileName } from './profiles.js';

/** Nó de navegação: cruzamento ou ponta de via. */
export interface NavNode {
  id: string;
  at: Vec2;
  kind: 'intersection' | 'endpoint';
}
/** Aresta de navegação: um trecho de via entre dois nós (centerline). */
export interface NavEdge {
  id: string;
  from: string;
  to: string;
  road: string;
  lanes: number;
  oneway: boolean;
  width: number;
  speedKmh: number;
}
/** Grafo de navegação (carros): nós + arestas. Derivado do SPEC, não da malha (ADR-0087). */
export interface NavGraph {
  nodes: NavNode[];
  edges: NavEdge[];
}

const DEFAULT_SPEED: Record<RoadProfileName, number> = {
  highway: 100, arterial: 60, urban_primary: 50, urban_secondary: 40, residential: 30, industrial: 40, dirt: 25, pedestrian_market: 0, alley: 20,
};
const SNAP = 6; // m — pontas/cruzamentos dentro disso viram o MESMO nó

function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0], dz = a[1] - b[1];
  return dx * dx + dz * dz;
}
function laneCount(profile: ReturnType<typeof getProfile>): number {
  return Math.max(1, profile.lanes.filter((l) => l.drivable).length);
}
function roadWidth(profile: ReturnType<typeof getProfile>): number {
  return profile.lanes.reduce((s, l) => s + l.width, 0);
}

/**
 * **Constrói o grafo de navegação dos carros** a partir da {@link RegionSpec} (ADR-0087). Nós =
 * cruzamentos declarados + pontas de via (snap por proximidade `SNAP`). Arestas = um trecho por
 * via (com faixas/oneway/largura/velocidade do perfil). Vias não-dirigíveis
 * (`pedestrian_market`) são ignoradas (entram na nav de pedestre, à parte).
 */
export function buildNavGraph(spec: RegionSpec): NavGraph {
  const nodes: NavNode[] = [];
  /** Acha um nó existente perto de `p`, ou cria um novo. */
  const nodeAt = (p: Vec2, kind: NavNode['kind']): string => {
    for (const n of nodes) {
      if (dist2(n.at, p) <= SNAP * SNAP) {
        if (kind === 'intersection') n.kind = 'intersection'; // cruzamento "promove" a ponta
        return n.id;
      }
    }
    const id = `nav-${nodes.length}`;
    nodes.push({ id, at: [p[0], p[1]], kind });
    return id;
  };

  const allInter = [...spec.interchanges, ...spec.cities.flatMap((c) => c.intersections)];
  for (const x of allInter) nodeAt(x.at, 'intersection');

  const edges: NavEdge[] = [];
  const allRoads: RoadSpec[] = [...spec.highways, ...spec.cities.flatMap((c) => c.roads)];
  for (const r of allRoads) {
    const profile = getProfile(r.profile);
    if (!profile.lanes.some((l) => l.drivable)) continue; // calçadão = sem aresta de carro
    const from = nodeAt(r.points[0]!, 'endpoint');
    const to = nodeAt(r.points[r.points.length - 1]!, 'endpoint');
    if (from === to) continue;
    edges.push({
      id: `edge-${r.id}`,
      from,
      to,
      road: r.id,
      lanes: laneCount(profile),
      oneway: r.oneway ?? false,
      width: roadWidth(profile),
      speedKmh: r.speedKmh ?? DEFAULT_SPEED[r.profile],
    });
  }
  return { nodes, edges };
}

/** Nós alcançáveis a partir de `fromId` (BFS, trata arestas como bidirecionais salvo `oneway`). */
export function navReachable(graph: NavGraph, fromId: string): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    if (!e.oneway) (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  const seen = new Set<string>([fromId]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * `true` se TODO nó com aresta é alcançável a partir do primeiro (grafo conexo) — teste de
 * sanidade: garante que todo setor é alcançável (ex.: da Delegacia). Grafo vazio = `true`.
 */
export function navConnected(graph: NavGraph): boolean {
  const withEdges = new Set<string>();
  for (const e of graph.edges) {
    withEdges.add(e.from);
    withEdges.add(e.to);
  }
  if (withEdges.size === 0) return true;
  const start = withEdges.values().next().value as string;
  const reach = navReachable(graph, start);
  for (const id of withEdges) if (!reach.has(id)) return false;
  return true;
}
