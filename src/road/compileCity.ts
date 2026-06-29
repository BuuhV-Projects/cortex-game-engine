import type { RegionSpec } from './citySpec.js';
import type { RoadProfileName } from './profiles.js';
import { buildNavGraph, type NavGraph } from './navGraph.js';

/** Nó de cena `road` emitido pelo compilador (estruturalmente um `SceneNode` road). */
export interface CompiledRoad {
  type: 'road';
  id: string;
  nodes: [number, number, number][];
  profile: RoadProfileName;
  conformTerrain: boolean;
  surface?: string;
}

/** Saída de {@link compileCity}: nós de via prontos pro `buildScene` + grafo de navegação. */
export interface CompiledCity {
  roads: CompiledRoad[];
  nav: NavGraph;
}

/**
 * **Compila uma {@link RegionSpec} em nós de cena** (ADR-0087): cada via (rodovias + ruas das
 * cidades) vira um nó `road` com `profile` (renderizado pelo `buildScene`/`makeProfiledRoad`,
 * conformando ao terreno) + o {@link NavGraph} dos carros. Pontos `[x,z]` viram `[x,0,z]` (a
 * altura vem do conform). Cruzamentos/quadras (ProBuilder)/landmarks são camadas à parte
 * (fase seguinte) — aqui entregamos a malha viária renderável + a navegação.
 *
 * @example
 * const { roads, nav } = compileCity(ceilandia)
 * await buildScene(game.scene, [{ nodes: roads } as any], { world: game.world })
 */
export function compileCity(region: RegionSpec): CompiledCity {
  const [ox, oz] = region.origin ?? [0, 0]; // coords de mapa → mundo (mundo centrado: [-2500,-2500])
  const all = [...region.highways, ...region.cities.flatMap((c) => c.roads)];
  const roads: CompiledRoad[] = all.map((r) => ({
    type: 'road',
    id: r.id,
    profile: r.profile,
    conformTerrain: true,
    nodes: r.points.map(([x, z]) => [x + ox, 0, z + oz] as [number, number, number]),
    ...(r.surface ? { surface: r.surface } : {}),
  }));
  const nav = buildNavGraph(region);
  for (const n of nav.nodes) n.at = [n.at[0] + ox, n.at[1] + oz]; // nav em coords de mundo
  return { roads, nav };
}
