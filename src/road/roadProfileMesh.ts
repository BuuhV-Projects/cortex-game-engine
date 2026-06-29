import type { RoadSample, Vec3 } from './RoadSpline.js';
import type { RoadRibbon } from './RoadMesh.js';
import { type RoadProfile, profileWidth } from './profiles.js';

const UP: Vec3 = [0, 1, 0];
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Um pedaço da malha do perfil: uma faixa (ou um meio-fio) com seu papel/material/colisão. */
export interface ProfileMeshPart {
  role: 'roadway' | 'sidewalk' | 'curb' | 'median' | 'shoulder';
  surface?: string;
  drivable: boolean;
  walkable: boolean;
  ribbon: RoadRibbon;
}

/** Borda longitudinal: offset lateral (m, a partir do centro) + altura (Y). */
interface Edge {
  off: number;
  h: number;
}

/**
 * Gera uma **tira** entre duas bordas longitudinais (`left`/`right`) ao longo das amostras.
 * Bordas com mesma altura e offsets diferentes = faixa plana; mesmo offset e alturas
 * diferentes = **meio-fio** (face vertical). Normal calculada por amostra (cross tangente×lateral).
 */
function strip(samples: RoadSample[], left: Edge, right: Edge, uvScale: number): RoadRibbon {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let dist = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    if (i > 0) {
      const p = samples[i - 1]!.pos;
      dist += Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1], s.pos[2] - p[2]);
    }
    const r = normalize(cross(UP, s.tangent)); // direita da pista
    const lp: Vec3 = [s.pos[0] + r[0] * left.off, s.pos[1] + left.h, s.pos[2] + r[2] * left.off];
    const rp: Vec3 = [s.pos[0] + r[0] * right.off, s.pos[1] + right.h, s.pos[2] + r[2] * right.off];
    // Normal da face = tangente × (direção atravessando left→right).
    const across = normalize([rp[0] - lp[0], rp[1] - lp[1], rp[2] - lp[2]]);
    const n = normalize(cross(s.tangent, across));
    const v = dist / uvScale;
    positions.push(lp[0], lp[1], lp[2], rp[0], rp[1], rp[2]);
    uvs.push(0, v, 1, v);
    normals.push(n[0], n[1], n[2], n[0], n[1], n[2]);
    if (i > 0) {
      const a = (i - 1) * 2, b = (i - 1) * 2 + 1, c = i * 2, d = i * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, uvs, normals, indices };
}

/**
 * **Extruda o perfil ({@link RoadProfile}) ao longo das amostras da spline** (ADR-0087) — o
 * coração do EasyRoad estendido. Cada faixa vira uma tira plana na sua altura; entre faixas de
 * alturas diferentes, gera um **meio-fio** (face vertical). Retorna um {@link ProfileMeshPart}
 * por faixa + um por meio-fio (papel `curb`), pro consumidor atribuir material/collider:
 * `drivable` → pista (`cortexRoad`), `curb` → parede baixa, `walkable` → calçada/nav de pedestre.
 *
 * O perfil é **centrado** na centerline (borda esquerda em −largura/2). `uvScale` = metros por
 * tile no comprimento.
 */
export function profileMesh(samples: RoadSample[], profile: RoadProfile, uvScale = 8): ProfileMeshPart[] {
  const parts: ProfileMeshPart[] = [];
  const total = profileWidth(profile);
  let off = -total / 2; // borda esquerda
  let prev: { off: number; h: number } | null = null;
  for (const lane of profile.lanes) {
    const l: Edge = { off, h: lane.height };
    const r: Edge = { off: off + lane.width, h: lane.height };
    // Meio-fio: degrau vertical entre a faixa anterior e esta (alturas diferentes).
    if (prev && prev.h !== lane.height) {
      const lo = Math.min(prev.h, lane.height);
      const hi = Math.max(prev.h, lane.height);
      parts.push({
        role: 'curb',
        surface: lane.surface ?? profile.surface,
        drivable: false,
        walkable: false,
        ribbon: strip(samples, { off, h: lo }, { off, h: hi }, uvScale),
      });
    }
    parts.push({
      role: lane.role,
      surface: lane.surface ?? profile.surface,
      drivable: lane.drivable,
      walkable: lane.walkable,
      ribbon: strip(samples, l, r, uvScale),
    });
    prev = { off: off + lane.width, h: lane.height };
    off += lane.width;
  }
  return parts;
}
