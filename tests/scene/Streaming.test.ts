/**
 * Streaming de células (M-perf-4 / ADR-0138): a lógica de residência é pura e
 * determinística — dado o centro da câmera, carrega dentro do raio (por
 * distância, até o orçamento) e descarrega além de raio+histerese.
 */
import { describe, it, expect } from 'vitest';
import { CellStreamingSystem, type StreamingCell } from '../../src/scene/Streaming.js';

/** Grade N×N de células com espaçamento `size`, centradas na origem. */
function grid(n: number, size: number): StreamingCell[] {
  const cells: StreamingCell[] = [];
  const half = (n * size) / 2;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells.push({ key: `${i},${j}`, x: -half + (i + 0.5) * size, z: -half + (j + 0.5) * size });
    }
  }
  return cells;
}

function makeSystem(cells: StreamingCell[], opts: Partial<Parameters<typeof CellStreamingSystem['prototype']['step']>[0]> & {
  radius: number; hysteresis?: number; budgetPerFrame?: number;
}) {
  const loads: string[] = [];
  const unloads: string[] = [];
  const sys = new CellStreamingSystem(cells, {
    radius: opts.radius,
    hysteresis: opts.hysteresis,
    budgetPerFrame: opts.budgetPerFrame,
    getCameraXZ: () => ({ x: 0, z: 0 }),
    onLoad: (k) => loads.push(k),
    onUnload: (k) => unloads.push(k),
  });
  return { sys, loads, unloads };
}

describe('CellStreamingSystem', () => {
  it('carrega só as células dentro do raio (as distantes ficam de fora)', () => {
    const cells = grid(9, 100); // 9×9, 100m
    const { sys, loads } = makeSystem(cells, { radius: 150, budgetPerFrame: 999 });
    sys.step({ x: 0, z: 0 });
    // dentro de 150m do centro: a célula central + vizinhas (não as 81)
    expect(sys.residentCount).toBeGreaterThan(0);
    expect(sys.residentCount).toBeLessThan(cells.length);
    for (const k of loads) {
      const c = cells.find((x) => x.key === k)!;
      expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(150);
    }
  });

  it('respeita o orçamento por frame (carrega no máximo N por step)', () => {
    const cells = grid(9, 50); // muitas dentro do raio
    const { sys, loads } = makeSystem(cells, { radius: 200, budgetPerFrame: 3 });
    sys.step({ x: 0, z: 0 });
    expect(loads.length).toBe(3);
    sys.step({ x: 0, z: 0 });
    expect(loads.length).toBe(6); // +3 no próximo frame
  });

  it('carrega as mais próximas primeiro (ordem por distância)', () => {
    const cells = grid(9, 100);
    const { sys, loads } = makeSystem(cells, { radius: 500, budgetPerFrame: 1 });
    sys.step({ x: 0, z: 0 });
    const first = cells.find((c) => c.key === loads[0])!;
    // a 1ª carregada é a mais próxima do centro
    const nearest = cells.reduce((a, b) => (Math.hypot(a.x, a.z) <= Math.hypot(b.x, b.z) ? a : b));
    expect(Math.hypot(first.x, first.z)).toBeCloseTo(Math.hypot(nearest.x, nearest.z));
  });

  it('descarrega ao afastar além de raio+histerese; histerese evita thrash', () => {
    // Uma única célula em (100,0). raio 120, histerese 80 → descarrega só >200.
    const cells: StreamingCell[] = [{ key: 'c', x: 100, z: 0 }];
    const loads: string[] = [];
    const unloads: string[] = [];
    let cam = { x: 0, z: 0 };
    const sys = new CellStreamingSystem(cells, {
      radius: 120,
      hysteresis: 80,
      budgetPerFrame: 999,
      getCameraXZ: () => cam,
      onLoad: (k) => loads.push(k),
      onUnload: (k) => unloads.push(k),
    });

    sys.update(); // câmera em (0,0): célula a 100m ≤ 120 → carrega
    expect(sys.residentCount).toBe(1);

    cam = { x: -50, z: 0 }; // célula agora a 150m (entre 120 e 200): NÃO descarrega
    sys.update();
    expect(unloads).toHaveLength(0);
    expect(sys.residentCount).toBe(1);

    cam = { x: -150, z: 0 }; // célula agora a 250m (>200): descarrega
    sys.update();
    expect(unloads).toEqual(['c']);
    expect(sys.residentCount).toBe(0);
  });

  it('idempotente: repetir o step no mesmo lugar não recarrega', () => {
    const cells = grid(5, 100);
    const { sys, loads } = makeSystem(cells, { radius: 500, budgetPerFrame: 999 });
    sys.step({ x: 0, z: 0 });
    const n = loads.length;
    sys.step({ x: 0, z: 0 });
    expect(loads.length).toBe(n); // nada novo carregou
  });
});
