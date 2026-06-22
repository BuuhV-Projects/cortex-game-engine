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
 * Gera a faixa da pista. `width` em metros; `uvScale` = quantas unidades de mundo
 * equivalem a 1 tile da textura ao longo do comprimento (default 8 m → asfalto tila
 * a cada 8 m). A largura inteira = 1 tile em U.
 */
export function roadRibbon(samples: RoadSample[], width: number, uvScale = 8): RoadRibbon {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const half = Math.max(0.05, width / 2);

  let dist = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (i > 0) {
      const p = samples[i - 1]!.pos;
      dist += Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1], s.pos[2] - p[2]);
    }
    // Lateral = up × tangente (direita da pista, +X p/ tangente +Z; mão direita →
    // winding pra cima). Normal = up (pista ~plana).
    const right = normalize(cross(UP, s.tangent));
    const lx = s.pos[0] - right[0] * half;
    const ly = s.pos[1] - right[1] * half;
    const lz = s.pos[2] - right[2] * half;
    const rx = s.pos[0] + right[0] * half;
    const ry = s.pos[1] + right[1] * half;
    const rz = s.pos[2] + right[2] * half;
    positions.push(lx, ly, lz, rx, ry, rz);
    normals.push(0, 1, 0, 0, 1, 0);
    const v = dist / uvScale;
    uvs.push(0, v, 1, v);
  }
  // Quads entre amostras consecutivas (2 tris). Vértice esquerdo = 2i, direito = 2i+1.
  for (let i = 0; i < samples.length - 1; i++) {
    const a = 2 * i;
    const b = 2 * i + 1;
    const c = 2 * (i + 1);
    const d = 2 * (i + 1) + 1;
    indices.push(a, c, b, b, c, d); // CCW visto de cima (+Y)
  }
  return { positions, uvs, normals, indices };
}

/** Monta a {@link BufferGeometry} da pista a partir das amostras + largura. */
export function toRoadGeometry(samples: RoadSample[], width: number, uvScale = 8): BufferGeometry {
  const r = roadRibbon(samples, width, uvScale);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(r.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(r.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(r.uvs, 2));
  g.setIndex(r.indices);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
