/**
 * **Malha da pista** (ribbon) a partir das amostras da spline (ADR-0072). Para cada
 * amostra, dois vértices (esquerda/direita) deslocados pela **lateral** (`right =
 * tangent × up`); ligamos amostras consecutivas em quads → faixa de estrada. UV: U
 * atravessa a largura (0..1), V corre ao longo do comprimento **por distância real**
 * (→ a textura tila sem esticar nas curvas).
 *
 * Puro: produz arrays (testável) + um helper que monta a `BufferGeometry`.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { RoadSample, Vec3 } from './RoadSpline.js';

const UP: Vec3 = [0, 1, 0];

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Dados crus da faixa: posições/UVs/normais (flat arrays) + índices dos triângulos. */
export interface RoadRibbon {
  positions: number[];
  uvs: number[];
  normals: number[];
  indices: number[];
}

/**
 * Gera a faixa da pista como uma **grade** (subdividida ao longo do comprimento E
 * **através da largura**, estilo Road Architect — pra a pista conformar bem ao terreno
 * com relevo, não só inclinar). `width` em metros; `uvScale` = unidades de mundo por
 * tile no comprimento (default 8 m); `widthSegments` = colunas ao longo da largura
 * (default 1 = só bordas esquerda/direita). UV: U atravessa 0..1, V por distância.
 */
export function roadRibbon(samples: RoadSample[], width: number, uvScale = 8, widthSegments = 1): RoadRibbon {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const half = Math.max(0.05, width / 2);
  const cols = Math.max(1, Math.floor(widthSegments));
  const vertsPerRow = cols + 1;

  let dist = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (i > 0) {
      const p = samples[i - 1]!.pos;
      dist += Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1], s.pos[2] - p[2]);
    }
    // Lateral = up × tangente (direita da pista, +X p/ tangente +Z; mão direita →
    // winding pra cima). Normal = up (recalculada após conformar ao terreno).
    const right = normalize(cross(UP, s.tangent));
    const v = dist / uvScale;
    for (let j = 0; j <= cols; j++) {
      const f = j / cols; // 0 (esquerda) .. 1 (direita)
      const off = (f - 0.5) * (half * 2); // -half .. +half
      positions.push(s.pos[0] + right[0] * off, s.pos[1] + right[1] * off, s.pos[2] + right[2] * off);
      normals.push(0, 1, 0);
      uvs.push(f, v);
    }
  }
  // Quads na grade entre amostras (linhas) × colunas.
  for (let i = 0; i < samples.length - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * vertsPerRow + j;
      const b = i * vertsPerRow + j + 1;
      const c = (i + 1) * vertsPerRow + j;
      const d = (i + 1) * vertsPerRow + j + 1;
      indices.push(a, c, b, b, c, d); // CCW visto de cima (+Y)
    }
  }
  return { positions, uvs, normals, indices };
}

/** Monta a {@link BufferGeometry} da pista a partir das amostras + largura. */
export function toRoadGeometry(samples: RoadSample[], width: number, uvScale = 8, widthSegments = 1): BufferGeometry {
  return ribbonToGeometry(roadRibbon(samples, width, uvScale, widthSegments));
}

/** Converte um {@link RoadRibbon} (posições/uvs/normais/índices) numa `BufferGeometry`. */
export function ribbonToGeometry(r: RoadRibbon): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(r.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(r.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(r.uvs, 2));
  g.setIndex(r.indices);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
