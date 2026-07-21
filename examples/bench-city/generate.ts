/**
 * **Gerador de cidade sintética** (M-perf-1 / ADR-0135) — produz uma
 * {@link SceneDefinition} determinística por `seed` usando **modelos `.glb`
 * reais** (kit "City Bench Test": prédios com geometria e PBR próximos de um
 * open-world de verdade), pra o benchmark medir o custo de render REAL — não o
 * de primitivas. Os 3 prédios (Large/Medium/Small: ~18-45k tris, 12-13 materiais
 * PBR cada) são espalhados numa grade e o custo emerge da geometria + materiais
 * + texturas, como num GTA.
 *
 * A mesma `seed` + params geram **exatamente** a mesma cena (testável); o
 * `bench.mjs` varia os params pra escalar a carga.
 */
import type { SceneDefinition, SceneNode } from '../../src/scene/SceneDefinition.js';

/** Parâmetros da cidade sintética. Tudo determinístico a partir de `seed`. */
export interface BenchCityParams {
  /** Semente do RNG (mesma seed → mesma cena). */
  seed: number;
  /** Prédios por lado (grade `rows × rows`). */
  rows: number;
  /** Distância entre centros de prédios, em metros (define a "rua"). */
  spacing: number;
  /** Objetos dinâmicos ("tráfego") — criados pelo `main.ts`, fora da cena estática. */
  traffic: number;
}

/** Configuração-alvo default (14×14 = 196 prédios reais — grande o bastante pra
 *  o streaming de células importar: só um raio ao redor da câmera fica residente). */
export const DEFAULT_BENCH_CITY: BenchCityParams = {
  seed: 1,
  rows: 14,
  spacing: 30,
  traffic: 40, // realista (GTA tem ~dezenas de carros visíveis, não centenas)
};

/** Modelos `.glb` do kit (relativos ao `assets/` do jogo exportado). */
export const BENCH_BUILDINGS = [
  'assets/models/Building_Large_2.glb',
  'assets/models/Building_Medium_2_001.glb',
  'assets/models/Building_Small_1.glb',
] as const;

// ── Constantes de layout (sem números mágicos inline) ────────────────────────
/** Espessura do chão (m). */
const GROUND_THICKNESS = 1;
/** Margem do chão além da grade de prédios (m). */
const GROUND_MARGIN = 40;
/** Rotações possíveis dos prédios (múltiplos de 90°, em radianos). */
const ROTATIONS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

/** RNG determinístico (mulberry32) — puro, mesmo `seed` → mesma sequência. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nº de prédios que a cena terá (útil pra testes e relatórios). */
export function buildingCount(params: BenchCityParams): number {
  return params.rows * params.rows;
}

/**
 * Gera a {@link SceneDefinition} da cidade: 1 chão + `rows²` prédios `.glb`
 * (ciclando os 3 modelos por RNG, com rotação de 90° variada).
 */
export function generateCityScene(params: BenchCityParams = DEFAULT_BENCH_CITY): SceneDefinition {
  const rng = mulberry32(params.seed);
  const extent = params.rows * params.spacing;
  const half = extent / 2;

  const nodes: SceneNode[] = [];

  // Chão: caixa grande e plana (estática, mergeável), centrada na origem.
  const groundSide = extent + GROUND_MARGIN * 2;
  nodes.push({
    type: 'primitive',
    id: 'ground',
    shape: 'box',
    size: [groundSide, GROUND_THICKNESS, groundSide],
    color: 0x3a3f47,
    transform: { position: [0, -GROUND_THICKNESS / 2, 0] },
    receiveShadow: true,
  });

  // Prédios: grade rows×rows, modelo e rotação escolhidos por RNG (determinístico).
  for (let ix = 0; ix < params.rows; ix++) {
    for (let iz = 0; iz < params.rows; iz++) {
      const x = -half + (ix + 0.5) * params.spacing;
      const z = -half + (iz + 0.5) * params.spacing;
      const url = BENCH_BUILDINGS[Math.floor(rng() * BENCH_BUILDINGS.length)]!;
      const rotY = ROTATIONS[Math.floor(rng() * ROTATIONS.length)]!;
      nodes.push({
        type: 'model',
        id: `b-${ix}-${iz}`,
        url,
        transform: { position: [x, 0, z], rotation: [0, rotY, 0] },
        castShadow: true,
        receiveShadow: true,
      });
    }
  }

  return {
    version: 1,
    nodes,
    background: 0x9fb8d4,
    fog: { color: 0x9fb8d4, near: extent * 0.2, far: extent * 1.1 },
    outdoorLighting: {
      sky: 0x9fb8d4,
      sunColor: 0xfff2e0,
      sunIntensity: 2.2,
      exposure: 1.0,
    },
  };
}
