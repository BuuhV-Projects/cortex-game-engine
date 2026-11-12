/**
 * Efeito embaixo d'água (SPEC-0726): resolução do estado, a matemática do shader
 * espelhada em CPU e o contrato com o host nativo.
 */
import { describe, it, expect } from 'vitest';
import {
  UNDERWATER_DEFAULTS,
  applyUnderwaterColor,
  resolveUnderwater,
  sameUnderwater,
  toNativeUnderwater,
  underwaterRippleOffset,
} from '../../src/core/underwater.js';

const BYTE = 255;

describe('resolveUnderwater', () => {
  it('desliga com null, amount 0 ou negativo', () => {
    expect(resolveUnderwater(null)).toBeNull();
    expect(resolveUnderwater({ amount: 0 })).toBeNull();
    expect(resolveUnderwater({ amount: -1 })).toBeNull();
    expect(resolveUnderwater({ amount: Number.NaN })).toBeNull();
  });

  it('usa os padrões calibrados pelo San Andreas', () => {
    const u = resolveUnderwater({ amount: 1 });
    expect(u).not.toBeNull();
    expect(u!.color[0]).toBeCloseTo(90 / BYTE);
    expect(u!.color[1]).toBeCloseTo(170 / BYTE);
    expect(u!.color[2]).toBeCloseTo(170 / BYTE);
    expect(u!.tint).toBe(UNDERWATER_DEFAULTS.tint);
    expect(u!.brightness).toBe(1);
    expect(u!.amplitude).toBeCloseTo(4 / 640);
    expect(u!.frequency).toBeCloseTo(0.04 * 448);
    expect(u!.speed).toBeCloseTo(1.5);
  });

  it('limita amount e tint a [0, 1]', () => {
    const u = resolveUnderwater({ amount: 3, tint: 2 })!;
    expect(u.amount).toBe(1);
    expect(u.tint).toBe(1);
    expect(resolveUnderwater({ amount: 0.5, tint: -1 })!.tint).toBe(0);
  });

  it('escurece pela profundidade até o preto em blackDepth', () => {
    expect(resolveUnderwater({ amount: 1, depth: 45 })!.brightness).toBeCloseTo(0.5);
    expect(resolveUnderwater({ amount: 1, depth: 200 })!.brightness).toBe(0);
    expect(resolveUnderwater({ amount: 1, depth: 10, blackDepth: 20 })!.brightness).toBeCloseTo(0.5);
    // profundidade negativa (câmera acima) não clareia; blackDepth inválido usa o padrão
    expect(resolveUnderwater({ amount: 1, depth: -5 })!.brightness).toBe(1);
    expect(resolveUnderwater({ amount: 1, depth: 45, blackDepth: 0 })!.brightness).toBeCloseTo(0.5);
  });

  it('aceita a cor em número ou em #rrggbb e cai no padrão se inválida', () => {
    expect(resolveUnderwater({ amount: 1, color: 0xff0000 })!.color).toEqual([1, 0, 0]);
    expect(resolveUnderwater({ amount: 1, color: '#00ff00' })!.color).toEqual([0, 1, 0]);
    expect(resolveUnderwater({ amount: 1, color: '0000ff' })!.color).toEqual([0, 0, 1]);
    const fallback = resolveUnderwater({ amount: 1, color: 'azul' })!.color;
    expect(fallback[0]).toBeCloseTo(90 / BYTE);
  });

  it('ripple: false zera a ondulação; campos parciais completam com o padrão', () => {
    const flat = resolveUnderwater({ amount: 1, ripple: false })!;
    expect(flat.amplitude).toBe(0);
    expect(underwaterRippleOffset(flat, 0.3, 12)).toBe(0);
    const partial = resolveUnderwater({ amount: 1, ripple: { amplitude: 0.01 } })!;
    expect(partial.amplitude).toBe(0.01);
    expect(partial.speed).toBeCloseTo(UNDERWATER_DEFAULTS.speed);
  });
});

describe('matemática do shader (espelho em CPU)', () => {
  it('a onda desloca na horizontal por sin(tempo·speed + y·frequency)·amplitude·amount', () => {
    const u = resolveUnderwater({ amount: 0.5, ripple: { amplitude: 0.01, frequency: 10, speed: 2 } })!;
    const y = 0.25;
    const t = 3;
    expect(underwaterRippleOffset(u, y, t)).toBeCloseTo(Math.sin(t * 2 + y * 10) * 0.01 * 0.5);
    // faixas: linhas diferentes no mesmo instante deslocam diferente
    expect(Math.abs(underwaterRippleOffset(u, 0.1, t) - underwaterRippleOffset(u, 0.2, t))).toBeGreaterThan(1e-4);
  });

  it('a tinta mistura com a cor da água e escurece; amount escala a mistura', () => {
    const full = resolveUnderwater({ amount: 1, color: 0x000000, tint: 0.5, depth: 0 })!;
    expect(applyUnderwaterColor([1, 1, 1], full)).toEqual([0.5, 0.5, 0.5]);
    const half = resolveUnderwater({ amount: 0.5, color: 0x000000, tint: 1 })!;
    const out = applyUnderwaterColor([0.8, 0.4, 0.2], half);
    expect(out[0]).toBeCloseTo(0.4);
    expect(out[1]).toBeCloseTo(0.2);
    const deep = resolveUnderwater({ amount: 1, tint: 0, depth: 90 })!;
    expect(applyUnderwaterColor([1, 1, 1], deep)).toEqual([0, 0, 0]);
  });
});

describe('ponte com o host', () => {
  it('sameUnderwater compara campo a campo (e null)', () => {
    const a = resolveUnderwater({ amount: 0.5 });
    const b = resolveUnderwater({ amount: 0.5 });
    expect(sameUnderwater(a, b)).toBe(true);
    expect(sameUnderwater(a, resolveUnderwater({ amount: 0.6 }))).toBe(false);
    expect(sameUnderwater(null, null)).toBe(true);
    expect(sameUnderwater(a, null)).toBe(false);
  });

  it('toNativeUnderwater achata a cor em r, g, b', () => {
    const p = toNativeUnderwater(resolveUnderwater({ amount: 1, color: 0xff8000, depth: 9 })!);
    expect(p.r).toBe(1);
    expect(p.g).toBeCloseTo(128 / BYTE);
    expect(p.b).toBe(0);
    expect(p.brightness).toBeCloseTo(0.9);
    expect(Object.keys(p).sort()).toEqual(
      ['amount', 'amplitude', 'b', 'brightness', 'frequency', 'g', 'r', 'speed', 'tint'].sort(),
    );
  });
});
