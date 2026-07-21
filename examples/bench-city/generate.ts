/**
 * **Gerador de cidade sintética** (M-perf-1 / ADR-0135) — produz uma
 * {@link SceneDefinition} determinística por `seed`, bem acima da carga da
 * fase-1 do teste4, pra servir de cena de estresse do benchmark de render
 * (PRD-0005). É **pura e sem assets**: só primitivas (prédios/chão) + um nó de
 * vegetação instanciada com placeholder procedural — roda igual no browser e no
 * host nativo, sem `.glb`/`.pak`.
 *
 * A mesma `seed` + mesmos params geram **exatamente** a mesma cena (testável);
 * o `bench.mjs` varia os params pra escalar a carga.
 */
import type { SceneDefinition, SceneNode } from '../../src/scene/SceneDefinition.js';

/** Parâmetros da cidade sintética. Tudo determinístico a partir de `seed`. */
export interface BenchCityParams {
  /** Semente do RNG (mesma seed → mesma cena). */
  seed: number;
  /** Blocos por lado (grade `blocks × blocks`). */
  blocks: number;
  /** Lado de um bloco, em unidades de mundo. */
  blockSize: number;
  /** Prédios por bloco (grade interna `√n × √n`, arredondada). */
  buildingsPerBlock: number;
  /** Nº de materiais distintos (cores) — vira o nº de grupos do merge estático. */
  materials: number;
  /** Instâncias de vegetação (placeholder `tree`) espalhadas pela cidade. */
  vegetation: number;
  /** Objetos dinâmicos ("tráfego") — criados pelo `main.ts`, fora da cena estática. */
  traffic: number;
}

/** Configuração-alvo default do benchmark (~2.000 nós estáticos, 40 materiais). */
export const DEFAULT_BENCH_CITY: BenchCityParams = {
  seed: 1,
  blocks: 12,
  blockSize: 64,
  buildingsPerBlock: 14,
  materials: 40,
  // 0 por default: qualquer `InstancedMesh` com `MeshStandardNodeMaterial` gera
  // um WGSL que o naga (wgpu-native = host de export) REJEITA ("Index out of
  // bounds"), o pipeline fica inválido e o host dá panic no queueSubmit. O Dawn
  // (Studio/browser) tolera o mesmo shader — por isso só quebra no export nativo.
  // Afeta vegetação instanciada de verdade (.glb) também. Ver ADR-0135 §achados;
  // suba este número quando o bug de codegen/robustez for resolvido.
  vegetation: 0,
  traffic: 200,
};

// ── Constantes de geometria (sem números mágicos inline) ─────────────────────
/** Altura mínima/máxima dos prédios (m). */
const BUILDING_MIN_H = 6;
const BUILDING_MAX_H = 48;
/** Fração do slot que o footprint do prédio ocupa (resto vira "rua"). */
const FOOTPRINT_FILL = 0.7;
/** Espessura do chão (m). */
const GROUND_THICKNESS = 1;
/** Margem da cidade além da grade de blocos (m). */
const CITY_MARGIN = 40;
/** Faixa de escala das instâncias de vegetação. */
const VEG_SCALE_MIN = 0.7;
const VEG_SCALE_MAX = 1.6;
/** Floats por instância de vegetação: `[x, y, z, rotY, scale]`. */
const FLOATS_PER_VEG = 5;
/** Saturação/luminância das cores de material (HSL). */
const MATERIAL_SATURATION = 0.55;
const MATERIAL_LIGHTNESS = 0.55;
const HUE_TURNS = 1;

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

/** Converte HSL (0..1) num inteiro `0xRRGGBB`. */
function hslToHex(h: number, s: number, l: number): number {
  const k = (n: number): number => (n + h * 12) % 12;
  const f = (n: number): number => {
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  };
  const to255 = (v: number): number => Math.round(v * 255);
  return (to255(f(0)) << 16) | (to255(f(8)) << 8) | to255(f(4));
}

/** Paleta determinística de `count` cores distintas espalhadas no matiz. */
function buildPalette(count: number): number[] {
  const palette: number[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (i / count) * HUE_TURNS;
    palette.push(hslToHex(hue, MATERIAL_SATURATION, MATERIAL_LIGHTNESS));
  }
  return palette;
}

/** Nº de prédios estáticos que a cena terá (útil pra testes e relatórios). */
export function buildingCount(params: BenchCityParams): number {
  return params.blocks * params.blocks * params.buildingsPerBlock;
}

/**
 * Gera a {@link SceneDefinition} da cidade sintética. Nós: 1 chão + N prédios
 * (primitivas `box`, coloridas por material) + 1 nó de vegetação instanciada.
 */
export function generateCityScene(params: BenchCityParams = DEFAULT_BENCH_CITY): SceneDefinition {
  const rng = mulberry32(params.seed);
  const palette = buildPalette(params.materials);
  const perSide = Math.max(1, Math.round(Math.sqrt(params.buildingsPerBlock)));
  const slot = params.blockSize / perSide;
  const cityExtent = params.blocks * params.blockSize;
  const half = cityExtent / 2;

  const nodes: SceneNode[] = [];

  // Chão: uma caixa grande e plana (estática, mergeável), centrada na origem.
  const groundSide = cityExtent + CITY_MARGIN * 2;
  nodes.push({
    type: 'primitive',
    id: 'ground',
    shape: 'box',
    size: [groundSide, GROUND_THICKNESS, groundSide],
    color: 0x3a3f47,
    transform: { position: [0, -GROUND_THICKNESS / 2, 0] },
    receiveShadow: true,
  });

  // Prédios: grade de blocos × grade interna. Cada prédio é uma caixa colorida
  // por um material da paleta (→ N grupos no merge estático).
  const wanted = params.buildingsPerBlock;
  for (let bx = 0; bx < params.blocks; bx++) {
    for (let bz = 0; bz < params.blocks; bz++) {
      const blockX = -half + bx * params.blockSize;
      const blockZ = -half + bz * params.blockSize;
      let placed = 0;
      for (let ix = 0; ix < perSide && placed < wanted; ix++) {
        for (let iz = 0; iz < perSide && placed < wanted; iz++) {
          const cx = blockX + (ix + 0.5) * slot;
          const cz = blockZ + (iz + 0.5) * slot;
          const height = BUILDING_MIN_H + rng() * (BUILDING_MAX_H - BUILDING_MIN_H);
          const footprint = slot * FOOTPRINT_FILL;
          const color = palette[Math.floor(rng() * palette.length)]!;
          nodes.push({
            type: 'primitive',
            id: `b-${bx}-${bz}-${placed}`,
            shape: 'box',
            size: [footprint, height, footprint],
            color,
            transform: { position: [cx, height / 2, cz] },
            castShadow: true,
            receiveShadow: true,
          });
          placed++;
        }
      }
    }
  }

  // Vegetação instanciada (placeholder procedural `tree`) espalhada pela cidade.
  const instances: number[] = new Array(params.vegetation * FLOATS_PER_VEG);
  for (let i = 0; i < params.vegetation; i++) {
    const o = i * FLOATS_PER_VEG;
    instances[o] = (rng() - 0.5) * cityExtent; // x
    instances[o + 1] = 0; // y (no chão)
    instances[o + 2] = (rng() - 0.5) * cityExtent; // z
    instances[o + 3] = rng() * Math.PI * 2; // rotY
    instances[o + 4] = VEG_SCALE_MIN + rng() * (VEG_SCALE_MAX - VEG_SCALE_MIN); // scale
  }
  nodes.push({
    type: 'vegetation',
    id: 'city-trees',
    kind: 'tree',
    instances,
    capacity: Math.max(1, params.vegetation),
    collide: false,
  });

  return {
    version: 1,
    nodes,
    background: 0x9fb8d4,
    fog: { color: 0x9fb8d4, near: cityExtent * 0.15, far: cityExtent * 0.75 },
    // Iluminação exterior mínima (forma sabidamente boa do template): sol +
    // sombra única. CSM (shadow cascades) fica como variante do M-perf-2, onde
    // interage com render bundles — aqui o foco é draw calls × materiais.
    outdoorLighting: {
      sky: 0x9fb8d4,
      sunColor: 0xfff2e0,
      sunIntensity: 2.2,
      exposure: 1.0,
    },
  };
}
