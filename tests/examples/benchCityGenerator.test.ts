/**
 * Testes do gerador de cidade sintética (examples/bench-city/generate.ts) —
 * o benchmark do M-perf-1 (ADR-0135) só é comparável entre execuções se a cena
 * for DETERMINÍSTICA: mesma seed + params → exatamente a mesma SceneDefinition.
 * Usa modelos `.glb` reais (kit City Bench Test) espalhados numa grade.
 */
import { describe, it, expect } from 'vitest';
import {
  generateCityScene,
  buildingCount,
  BENCH_BUILDINGS,
  DEFAULT_BENCH_CITY,
  type BenchCityParams,
} from '../../examples/bench-city/generate.js';

const SMALL: BenchCityParams = { seed: 42, rows: 4, spacing: 30, traffic: 10 };

describe('generateCityScene', () => {
  it('é determinística: mesma seed → cena idêntica', () => {
    expect(JSON.stringify(generateCityScene(SMALL))).toBe(JSON.stringify(generateCityScene(SMALL)));
  });

  it('seeds diferentes → cenas diferentes', () => {
    const a = generateCityScene({ ...SMALL, seed: 1 });
    const b = generateCityScene({ ...SMALL, seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('contagem de nós = chão + rows² prédios', () => {
    const scene = generateCityScene(SMALL);
    expect(scene.nodes).toHaveLength(1 + buildingCount(SMALL));
    expect(buildingCount(SMALL)).toBe(SMALL.rows * SMALL.rows);
  });

  it('prédios referenciam só os modelos .glb do kit', () => {
    const scene = generateCityScene(SMALL);
    const models = scene.nodes.filter((n) => n.type === 'model');
    expect(models.length).toBe(buildingCount(SMALL));
    for (const m of models) {
      expect(BENCH_BUILDINGS).toContain((m as { url: string }).url);
    }
  });

  it('prédios ficam dentro da grade (posições espaçadas)', () => {
    const scene = generateCityScene(SMALL);
    const extent = SMALL.rows * SMALL.spacing;
    for (const n of scene.nodes) {
      if (n.type !== 'model') continue;
      const [x, y, z] = (n as { transform: { position: [number, number, number] } }).transform.position;
      expect(Math.abs(x)).toBeLessThanOrEqual(extent / 2);
      expect(Math.abs(z)).toBeLessThanOrEqual(extent / 2);
      expect(y).toBe(0);
    }
  });

  it('cena válida: version 1, fog e iluminação exterior', () => {
    const scene = generateCityScene(SMALL);
    expect(scene.version).toBe(1);
    expect(scene.fog).toBeDefined();
    expect(scene.outdoorLighting?.sunIntensity).toBeGreaterThan(0);
  });

  it('config default: 64 prédios (8×8)', () => {
    expect(buildingCount(DEFAULT_BENCH_CITY)).toBe(64);
  });
});
