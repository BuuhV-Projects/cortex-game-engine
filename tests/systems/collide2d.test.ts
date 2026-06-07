/**
 * Testes do solver de separação 2D (src/systems/collide2d.ts) — box/circle/capsule.
 * Normal aponta de B pra A; depth > 0 quando sobrepostos.
 */
import { describe, it, expect } from 'vitest';
import { penetrate, type Shape2D } from '../../src/systems/collide2d.js';

const box = (hw = 0.5, hh = 0.5): Shape2D => ({ kind: 'box', hw, hh });
const circle = (r = 0.5): Shape2D => ({ kind: 'circle', hw: r, hh: r });
const capsule = (r = 0.5, hh = 1): Shape2D => ({ kind: 'capsule', hw: r, hh });

describe('penetrate (collide2d)', () => {
  it('círculo acima de box: normal pra cima, depth = sobreposição', () => {
    // círculo (0,0.9) r0.5 → base 0.4; box top 0.5 → overlap 0.1
    const s = penetrate(0, 0.9, circle(0.5), 0, 0, box(2, 0.5));
    expect(s).not.toBeNull();
    expect(s!.ny).toBeGreaterThan(0.95);
    expect(s!.depth).toBeCloseTo(0.1, 5);
  });

  it('sem sobreposição → null', () => {
    expect(penetrate(0, 2, circle(0.5), 0, 0, box(2, 0.5))).toBeNull();
  });

  it('círculo vs círculo: normal no eixo, depth = soma - distância', () => {
    const s = penetrate(0.8, 0, circle(0.5), 0, 0, circle(0.5));
    expect(s!.nx).toBeCloseTo(1, 5);
    expect(s!.depth).toBeCloseTo(0.2, 5);
  });

  it('box vs círculo: empurra o box (A) pra fora do círculo', () => {
    const s = penetrate(0, 0.9, box(0.5, 0.5), 0, 0, circle(0.5));
    expect(s!.ny).toBeGreaterThan(0.5);
  });

  it('cápsula encostando de lado num box: normal horizontal', () => {
    const s = penetrate(0.9, 0, capsule(0.5, 1), 0, 0, box(0.5, 2));
    expect(Math.abs(s!.nx)).toBeGreaterThan(0.9);
    expect(s!.depth).toBeCloseTo(0.1, 5);
  });

  it('centro do círculo dentro do box → empurra pela face mais próxima', () => {
    // círculo (0.4,0) dentro de box (0,0) hw0.5 hh2: face direita mais próxima
    const s = penetrate(0.4, 0, circle(0.3), 0, 0, box(0.5, 2));
    expect(s!.nx).toBeGreaterThan(0.9);
  });
});
