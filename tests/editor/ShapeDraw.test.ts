/**
 * Testes da parte pura do "desenhar caixa no chão" (ProBuilder New Shape — ADR-0071):
 * `boxFromDrag` deriva centro + dimensões de dois pontos no chão + altura.
 */
import { describe, it, expect } from 'vitest';
import { boxFromDrag } from '../../src/editor/ShapeDrawSystem.js';
import { resolveWallPush } from '../../src/systems/CharacterPhysicsSystem.js';

describe('boxFromDrag', () => {
  it('centra a caixa entre os dois pontos e assenta a base no chão', () => {
    const { position, params } = boxFromDrag([0, 2, 0], [4, 2, 6], 3);
    expect(params).toEqual({ width: 4, height: 3, depth: 6 });
    // centro XZ no meio; centro Y = groundY (2) + altura/2 (1.5) = 3.5
    expect(position).toEqual([2, 3.5, 3]);
  });

  it('independe da ordem/direção do arrasto (usa min/max)', () => {
    const a = boxFromDrag([4, 0, 6], [0, 0, 0], 2);
    const b = boxFromDrag([0, 0, 0], [4, 0, 6], 2);
    expect(a).toEqual(b);
  });

  it('aplica mínimos (largura/profundidade/altura) pra não criar caixa degenerada', () => {
    const { params } = boxFromDrag([1, 0, 1], [1, 0, 1], 0);
    expect(params.width).toBeGreaterThanOrEqual(0.1);
    expect(params.depth).toBeGreaterThanOrEqual(0.1);
    expect(params.height).toBeGreaterThanOrEqual(0.1);
  });
});

describe('resolveWallPush (colisão de parede do Character)', () => {
  const R = 0.5;

  it('sem hits = sem empurrão', () => {
    expect(resolveWallPush({ px: null, nx: null, pz: null, nz: null }, R)).toEqual({ dx: 0, dz: 0 });
  });

  it('parede em +X dentro do raio empurra pra −X', () => {
    const { dx, dz } = resolveWallPush({ px: 0.2, nx: null, pz: null, nz: null }, R);
    expect(dx).toBeCloseTo(-0.3); // r - dist = 0.5 - 0.2
    expect(dz).toBe(0);
  });

  it('parede além do raio não empurra', () => {
    expect(resolveWallPush({ px: 0.6, nx: null, pz: null, nz: null }, R)).toEqual({ dx: 0, dz: 0 });
  });

  it('canto (+X e +Z) empurra nas duas direções', () => {
    const { dx, dz } = resolveWallPush({ px: 0.1, nx: null, pz: 0.1, nz: null }, R);
    expect(dx).toBeCloseTo(-0.4);
    expect(dz).toBeCloseTo(-0.4);
  });
});
