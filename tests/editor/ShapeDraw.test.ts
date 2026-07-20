/**
 * Testes da parte pura do "desenhar caixa no chão" (ProBuilder New Shape — SPEC-0071):
 * `boxFromDrag` deriva centro + dimensões de dois pontos no chão + altura.
 */
import { describe, it, expect } from 'vitest';
import { boxFromDrag, fitModelToBox } from '../../src/editor/ShapeDrawSystem.js';
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

describe('fitModelToBox (desenhar blockout com .glb — SPEC-0093)', () => {
  // Modelo nativo 2×1×2 com pivô na base-centro (min y=0), como as peças de kit.
  const native = { min: [-1, 0, -1] as [number, number, number], max: [1, 1, 1] as [number, number, number] };

  it('escala por eixo pra preencher a caixa desenhada', () => {
    const box = boxFromDrag([0, 0, 0], [8, 0, 4], 3); // 8×3×4 na origem do chão
    const { scale } = fitModelToBox(native, box);
    expect(scale[0]).toBeCloseTo(4); // 8/2
    expect(scale[1]).toBeCloseTo(3); // 3/1
    expect(scale[2]).toBeCloseTo(2); // 4/2
  });

  it('alinha a BASE do bbox ao chão e centra em X/Z', () => {
    const box = boxFromDrag([2, 5, 2], [6, 5, 6], 2); // chão em y=5
    const { position, scale } = fitModelToBox(native, box);
    expect(position[0]).toBeCloseTo(4); // centro X (pivô centrado)
    expect(position[2]).toBeCloseTo(4);
    expect(position[1]).toBeCloseTo(5); // min.y nativo = 0 → pivô no chão
    // bbox final: base = pos.y + min.y*scale = 5 ✓; topo = 5 + 1*scale[1] = 7 ✓
    expect(5 + 1 * scale[1]).toBeCloseTo(7);
  });

  it('pivô deslocado (min.y < 0) compensa pra base não afundar', () => {
    const off = { min: [0, -0.5, 0] as [number, number, number], max: [2, 0.5, 2] as [number, number, number] };
    const box = boxFromDrag([0, 0, 0], [2, 0, 2], 1);
    const { position, scale } = fitModelToBox(off, box);
    // base do bbox = pos.y + (-0.5)*scale.y deve cair no chão (0)
    expect(position[1] + -0.5 * scale[1]).toBeCloseTo(0);
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
