/**
 * Testes do gerador de cidade sintética (examples/bench-city/generate.ts) —
 * o benchmark do M-perf-1 (ADR-0135) só é comparável entre execuções se a cena
 * for DETERMINÍSTICA: mesma seed + params → exatamente a mesma SceneDefinition.
 */
import { describe, it, expect } from 'vitest';
import {
  generateCityScene,
  buildingCount,
  DEFAULT_BENCH_CITY,
  type BenchCityParams,
} from '../../examples/bench-city/generate.js';

const SMALL: BenchCityParams = {
  seed: 42,
  blocks: 3,
  blockSize: 40,
  buildingsPerBlock: 4,
  materials: 5,
  vegetation: 100,
  traffic: 10,
};

describe('generateCityScene', () => {
  it('é determinística: mesma seed → cena idêntica', () => {
    const a = generateCityScene(SMALL);
    const b = generateCityScene(SMALL);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('seeds diferentes → cenas diferentes', () => {
    const a = generateCityScene({ ...SMALL, seed: 1 });
    const b = generateCityScene({ ...SMALL, seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('contagem de nós = chão + prédios + vegetação', () => {
    const scene = generateCityScene(SMALL);
    const expected = 1 + buildingCount(SMALL) + 1;
    expect(scene.nodes).toHaveLength(expected);
    expect(buildingCount(SMALL)).toBe(SMALL.blocks * SMALL.blocks * SMALL.buildingsPerBlock);
  });

  it('cores dos prédios saem da paleta de N materiais', () => {
    const scene = generateCityScene(SMALL);
    const buildings = scene.nodes.filter((n) => n.type === 'primitive' && n.id.startsWith('b-'));
    const colors = new Set(buildings.map((b) => (b as { color: number }).color));
    // no máximo N cores distintas (a paleta), e todas inteiros
    expect(colors.size).toBeLessThanOrEqual(SMALL.materials);
    for (const c of colors) expect(Number.isInteger(c)).toBe(true);
  });

  it('vegetação: instances = count × 5 floats, capacity = count', () => {
    const scene = generateCityScene(SMALL);
    const veg = scene.nodes.find((n) => n.type === 'vegetation');
    expect(veg).toBeDefined();
    const v = veg as { instances: number[]; capacity: number };
    expect(v.instances).toHaveLength(SMALL.vegetation * 5);
    expect(v.capacity).toBe(SMALL.vegetation);
  });

  it('cena válida: version 1, fog e iluminação exterior', () => {
    const scene = generateCityScene(SMALL);
    expect(scene.version).toBe(1);
    expect(scene.fog).toBeDefined();
    expect(scene.outdoorLighting?.sunIntensity).toBeGreaterThan(0);
  });

  it('a config default gera a ordem de grandeza esperada (~2k prédios, 40 materiais)', () => {
    expect(buildingCount(DEFAULT_BENCH_CITY)).toBeGreaterThanOrEqual(1500);
    expect(DEFAULT_BENCH_CITY.materials).toBe(40);
  });
});
