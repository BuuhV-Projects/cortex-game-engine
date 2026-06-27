/**
 * Testes do greide + moldagem do terreno (ADR-0072 Fase 2): `smoothGrade` (alisa +
 * limita inclinação), `moldHeightfield` (cut & fill + talude) e `mergeDeltas`.
 */
import { describe, it, expect } from 'vitest';
import { smoothGrade, moldHeightfield, mergeDeltas, type GradePoint } from '../../src/road/RoadGrade.js';
import type { RoadSample, Vec3 } from '../../src/road/RoadSpline.js';

/** Amostras numa reta ao longo de +Z, com altura de terreno `ys` por amostra. */
function samplesAlongZ(ys: number[], step = 2): RoadSample[] {
  return ys.map((y, i) => ({ pos: [0, y, i * step] as Vec3, tangent: [0, 0, 1] as Vec3 }));
}

describe('smoothGrade', () => {
  it('terreno plano → greide plano (mesma altura)', () => {
    const ys = [3, 3, 3, 3, 3];
    const g = smoothGrade(samplesAlongZ(ys), ys, { maxSlope: 0.1 });
    expect(g.every((v) => Math.abs(v - 3) < 1e-6)).toBe(true);
  });

  it('limita a inclinação a maxSlope (degrau vira rampa suave)', () => {
    // Degrau abrupto: sobe 10 m em 2 m (slope 5) — bem acima do limite.
    const ys = [0, 0, 0, 10, 10, 10];
    const step = 2;
    const g = smoothGrade(samplesAlongZ(ys, step), ys, { maxSlope: 0.5, smoothMeters: 0 });
    for (let i = 1; i < g.length; i++) {
      const slope = Math.abs(g[i]! - g[i - 1]!) / step;
      expect(slope).toBeLessThanOrEqual(0.5 + 1e-6); // greide respeita o limite
    }
    // Ainda sobe no geral (começa baixo, termina alto).
    expect(g[g.length - 1]!).toBeGreaterThan(g[0]!);
  });

  it('média móvel alisa uma bossa isolada', () => {
    const ys = [0, 0, 6, 0, 0]; // pico no meio
    const g = smoothGrade(samplesAlongZ(ys, 2), ys, { maxSlope: 10, smoothMeters: 8 });
    expect(g[2]!).toBeLessThan(6); // o pico foi alisado pra baixo
    expect(g[2]!).toBeGreaterThan(0);
  });

  it('degenerado (<2 amostras) devolve a entrada', () => {
    expect(smoothGrade([{ pos: [0, 1, 0], tangent: [0, 0, 1] }], [1])).toEqual([1]);
  });
});

describe('moldHeightfield (cut & fill + talude)', () => {
  // Grade 9×9 (res 8) em 20×20, base toda 0. Eixo reto em x=0 (z −10..10), greide y=2.
  const grid = { width: 20, depth: 20, resolution: 8, base: new Float32Array(81) };
  const centerline: GradePoint[] = [
    { x: 0, z: -10, y: 2 },
    { x: 0, z: 10, y: 2 },
  ];
  const n = 9;
  const idx = (i: number, j: number): number => j * n + i; // i=col(x), j=row(z)
  // z=0 → j=4. x: i=4→0, i=5→2.5, i=7→7.5, i=8→10.

  // cell = 20/8 = 2.5 → ombro mín. ~3.75 → platô vai até half(2)+3.75 = 5.75; talude até 8.75.
  it('sob a pista crava no greide (delta = greide − base)', () => {
    const d = moldHeightfield(grid, centerline, 2, 3); // half 2, talude 3
    expect(d[idx(4, 4)]).toBeCloseTo(2, 5); // x=0: aterra 0→2
  });

  it('ombro: vértice logo fora da pista fica COLADO no nível do greide (sem vão)', () => {
    const d = moldHeightfield(grid, centerline, 2, 3);
    // x=2.5 está fora da meia-largura (2) mas dentro do platô (ombro) → cravado no greide
    expect(d[idx(5, 4)]).toBeCloseTo(2, 5);
  });

  it('no talude a transição é suave (entre greide e base)', () => {
    const d = moldHeightfield(grid, centerline, 2, 3);
    const mid = d[idx(7, 4)]!; // x=7.5: dentro do talude (5.75 < 7.5 < 8.75)
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(2);
  });

  it('fora do alcance (platô+talude) o terreno fica intacto (delta 0)', () => {
    const d = moldHeightfield(grid, centerline, 2, 3);
    expect(d[idx(8, 4)]).toBe(0); // x=10, além do alcance (8.75)
  });

  it('corte: greide ABAIXO da base gera delta negativo sob a pista', () => {
    const base = new Float32Array(81).fill(5); // terreno em +5
    const cut: GradePoint[] = [{ x: 0, z: -10, y: 1 }, { x: 0, z: 10, y: 1 }]; // pista em +1
    const d = moldHeightfield({ ...grid, base }, cut, 2, 3);
    expect(d[idx(4, 4)]).toBeCloseTo(1 - 5, 5); // corta 5→1
  });

  it('centerline com <2 pontos não molda nada', () => {
    const d = moldHeightfield(grid, [{ x: 0, z: 0, y: 9 }], 2, 3);
    expect(d.every((v) => v === 0)).toBe(true);
  });
});

describe('mergeDeltas', () => {
  it('vence o de maior magnitude por vértice', () => {
    const a = new Float32Array([0, 5, -1, 0]);
    const b = new Float32Array([2, -3, -8, 0]);
    expect(Array.from(mergeDeltas([a, b])!)).toEqual([2, 5, -8, 0]);
  });
  it('lista vazia → null', () => {
    expect(mergeDeltas([])).toBeNull();
  });
});
