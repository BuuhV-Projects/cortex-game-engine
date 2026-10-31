/**
 * Núcleo puro da estrada por spline (SPEC-0631): spline, fita, greide e corte/aterro.
 */
import { describe, it, expect } from 'vitest';
import { sampleSpline, splineLength, type RoadVec3 } from '../../src/road/RoadSpline.js';
import { roadRibbon, roadColumns } from '../../src/road/RoadMesh.js';
import { smoothGrade, moldHeightfield, mergeDeltas, type HeightfieldGrid } from '../../src/road/RoadGrade.js';
import { roadFieldsSchema, roadOverlaySchema } from '../../src/road/roadFields.js';

const straight: RoadVec3[] = [
  [0, 0, -20],
  [0, 0, 20],
];

describe('sampleSpline', () => {
  it('passa pelos pontos das pontas e mede o comprimento', () => {
    const s = sampleSpline(straight);
    expect(s[0]!.pos).toEqual([0, 0, -20]);
    expect(s[s.length - 1]!.pos).toEqual([0, 0, 20]);
    expect(splineLength(s)).toBeCloseTo(40, 5);
  });

  it('curva fechada ganha mais amostras que reta do mesmo tamanho', () => {
    const curve = sampleSpline([[0, 0, 0], [10, 0, 10], [0, 0, 20]]);
    const line = sampleSpline([[0, 0, 0], [0, 0, 10], [0, 0, 20]]);
    expect(curve.length).toBeGreaterThan(line.length);
  });
});

describe('roadRibbon', () => {
  it('largura certa, plana no Y do greide, UV por distância', () => {
    const s = sampleSpline(straight);
    const grade = s.map(() => 3);
    const r = roadRibbon(s, 8, 8, grade, 0.05);
    const cols = roadColumns(8);
    expect(r.positions.length / 3).toBe(s.length * (cols + 1));
    expect(r.indices.length).toBe((s.length - 1) * cols * 6);
    // 1ª linha: de x=-4 a x=+4 (tangente +Z → direita = +X), todos em y = 3,05.
    expect(r.positions[0]).toBeCloseTo(-4, 5);
    expect(r.positions[cols * 3]).toBeCloseTo(4, 5);
    for (let i = 1; i < r.positions.length; i += 3) expect(r.positions[i]).toBeCloseTo(3.05, 5);
    // V da última linha = 40 m / 8 m.
    expect(r.uvs[r.uvs.length - 1]).toBeCloseTo(5, 5);
  });

  it('triângulos virados pra cima (+Y)', () => {
    const r = roadRibbon(sampleSpline(straight), 8);
    const p = (i: number): number[] => r.positions.slice(i * 3, i * 3 + 3);
    const [a, b, c] = [p(r.indices[0]!), p(r.indices[1]!), p(r.indices[2]!)];
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    expect(u[2]! * v[0]! - u[0]! * v[2]!).toBeGreaterThan(0); // componente Y de u × v
  });
});

describe('smoothGrade', () => {
  const samples = sampleSpline([[0, 0, 0], [0, 0, 100]]);
  const dist = samples.map((s) => s.pos[2]);

  it('respeita a inclinação máxima num degrau', () => {
    const step = dist.map((z) => (z > 50 ? 20 : 0));
    const g = smoothGrade(samples, step, { maxSlope: 0.1, smoothMeters: 0 });
    for (let i = 1; i < g.length; i++) {
      const dz = dist[i]! - dist[i - 1]!;
      expect(Math.abs(g[i]! - g[i - 1]!)).toBeLessThanOrEqual(0.1 * dz + 1e-9);
    }
  });

  it('rampa abaixo do limite passa intacta (sem média)', () => {
    const ramp = dist.map((z) => z * 0.05);
    const g = smoothGrade(samples, ramp, { maxSlope: 0.25, smoothMeters: 0 });
    g.forEach((y, i) => expect(y).toBeCloseTo(ramp[i]!, 6));
  });

  it('média móvel alisa uma bossa', () => {
    const bump = dist.map((z) => (Math.abs(z - 50) < 2 ? 4 : 0));
    const g = smoothGrade(samples, bump, { maxSlope: 0, smoothMeters: 20 });
    expect(Math.max(...g)).toBeLessThan(4);
  });
});

describe('moldHeightfield', () => {
  // Terreno 100×100, célula de 1 m, base num morro de 10 m de altura.
  const res = 100;
  const n = res + 1;
  const base = new Array<number>(n * n).fill(10);
  const grid: HeightfieldGrid = { width: 100, depth: 100, resolution: res, base };
  const line = [
    { x: 0, z: -40, y: 2 },
    { x: 0, z: 40, y: 2 },
  ];
  const at = (d: Float32Array, x: number, z: number): number => base[0]! + d[(z + 50) * n + (x + 50)]!;

  it('corta até o greide no platô e volta à base fora do talude', () => {
    const d = moldHeightfield(grid, line, 4, 6);
    expect(at(d, 0, 0)).toBeCloseTo(2, 5); // eixo
    expect(at(d, 4, 0)).toBeCloseTo(2, 5); // borda da pista (platô)
    expect(at(d, 5, 0)).toBeCloseTo(2, 5); // acostamento ≥ 1,5 célula
    expect(at(d, 30, 0)).toBe(10); // longe: base intacta
  });

  it('o talude sobe monotonamente do greide até a base', () => {
    const d = moldHeightfield(grid, line, 4, 6);
    let prev = -Infinity;
    for (let x = 0; x <= 14; x++) {
      const y = at(d, x, 0);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = y;
    }
    expect(at(d, 12, 0)).toBeCloseTo(10, 5);
  });

  it('aterra quando o greide está acima da base', () => {
    const d = moldHeightfield(grid, line.map((p) => ({ ...p, y: 15 })), 4, 6);
    expect(at(d, 0, 0)).toBeCloseTo(15, 5);
  });

  it('mergeDeltas: vence o maior módulo', () => {
    const a = new Float32Array([1, -5, 0]);
    const b = new Float32Array([-3, 2, 0.5]);
    expect(Array.from(mergeDeltas([a, b])!)).toEqual([-3, -5, 0.5]);
    expect(mergeDeltas([])).toBeNull();
  });
});

describe('roadFieldsSchema', () => {
  it('exige ≥2 pontos; o overlay aceita qualquer subconjunto', () => {
    expect(roadFieldsSchema.safeParse({ points: [[0, 0, 0]] }).success).toBe(false);
    expect(roadFieldsSchema.safeParse({ points: straight }).success).toBe(true);
    expect(roadOverlaySchema.safeParse({ width: 12 }).success).toBe(true);
    expect(roadOverlaySchema.safeParse({ grade: 'diagonal' }).success).toBe(false);
  });
});
