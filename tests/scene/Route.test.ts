/**
 * Progresso em rota (ADR-0256), sobre rotas de resposta conhecida: um quadrado
 * de 10 m (perímetro 40) e um círculo de raio 50.
 */
import { describe, it, expect } from 'vitest';
import {
  crossesGate,
  nearestRoutePoint,
  projectOnRoute,
  routeCurvature,
  routeFrame,
  routeIndexOf,
  routeSeparation,
  sampleRoute,
  sectorProgress,
  wrapDistance,
  type RouteGate,
  type RoutePoint,
} from '../../src/scene/Route.js';

const p = (x: number, z: number, y = 0): RoutePoint => ({ x, y, z });

/** Quadrado anti-horário visto de cima: (0,0) → (10,0) → (10,10) → (0,10). */
const square = (): RoutePoint[] => [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];

const CIRCLE_RADIUS = 50;
const CIRCLE_POINTS = 100;
const circle = (): RoutePoint[] =>
  Array.from({ length: CIRCLE_POINTS }, (_, i) => {
    const a = (i / CIRCLE_POINTS) * Math.PI * 2;
    return p(Math.cos(a) * CIRCLE_RADIUS, Math.sin(a) * CIRCLE_RADIUS);
  });

/** Pseudo-aleatório determinístico: mesmos casos em toda execução. */
function lcg(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

describe('routeIndexOf', () => {
  it('mede o perímetro fechado e a distância acumulada', () => {
    const index = routeIndexOf(square());
    expect(index.length).toBe(40);
    expect([...index.cumulative]).toEqual([0, 10, 20, 30, 40]);
  });

  it('é calculado uma vez por rota', () => {
    const route = square();
    expect(routeIndexOf(route)).toBe(routeIndexOf(route));
  });
});

describe('sampleRoute', () => {
  it('acha o ponto a N metros, dando a volta nos dois sentidos', () => {
    const route = square();
    expect(sampleRoute(route, 0, 15)).toEqual(p(10, 5));
    expect(sampleRoute(route, 0, 45)).toEqual(p(5, 0));
    expect(sampleRoute(route, 0, -5)).toEqual(p(0, 5));
    expect(sampleRoute(route, 2, 5)).toEqual(p(5, 10));
  });

  it('ponto repetido (segmento de comprimento zero) não divide por zero', () => {
    const route = [p(0, 0), p(10, 0), p(10, 0), p(10, 10), p(0, 10)];
    for (let d = 0; d < 40; d += 2.5) {
      const s = sampleRoute(route, 0, d);
      expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true);
    }
    expect(sampleRoute(route, 0, 15)).toEqual(p(10, 5));
  });

  it('recicla o buffer passado', () => {
    const out = p(0, 0);
    expect(sampleRoute(square(), 0, 5, out)).toBe(out);
  });

  it('rota degenerada devolve cópia, não o próprio ponto da rota', () => {
    const route = [p(3, 3), p(3, 3)];
    const s = sampleRoute(route, 0, 1);
    s.x = 99;
    expect(route[0]!.x).toBe(3);
  });
});

describe('routeSeparation', () => {
  it('mede com sinal e atravessa a linha de chegada pelo caminho curto', () => {
    const route = square();
    expect(routeSeparation(route, { index: 0, offset: 5 }, { index: 1, offset: 5 })).toBe(10);
    expect(routeSeparation(route, { index: 1, offset: 5 }, { index: 0, offset: 5 })).toBe(-10);
    // 35 m → 5 m: são 10 m À FRENTE cruzando a chegada, não 30 m atrás.
    expect(routeSeparation(route, { index: 3, offset: 5 }, { index: 0, offset: 5 })).toBe(10);
  });
});

describe('wrapDistance', () => {
  it('traz qualquer distância para [0, perímetro)', () => {
    expect(wrapDistance(40, 45)).toBe(5);
    expect(wrapDistance(40, -5)).toBe(35);
    expect(wrapDistance(0, 7)).toBe(0);
  });
});

describe('nearestRoutePoint', () => {
  it('com semente dá o mesmo que a varredura completa', () => {
    const route = circle();
    const random = lcg(42);
    let seed = 0;
    for (let i = 0; i < 500; i++) {
      // Anda pelo círculo com ruído lateral, como um carro na pista.
      const a = (i / 500) * Math.PI * 4;
      const r = CIRCLE_RADIUS + (random() - 0.5) * 6;
      const position = p(Math.cos(a) * r, Math.sin(a) * r);
      const full = nearestRoutePoint(position, route);
      seed = nearestRoutePoint(position, route, seed);
      expect(seed).toBe(full);
    }
  });

  it('semente velha (teleporte) cai na varredura completa', () => {
    const route = circle();
    const opposite = p(-CIRCLE_RADIUS, 0);
    expect(nearestRoutePoint(opposite, route, 0)).toBe(CIRCLE_POINTS / 2);
  });
});

describe('projectOnRoute', () => {
  it('projeta no segmento vizinho certo, com offset horizontal', () => {
    const route = square();
    expect(projectOnRoute(p(4, -1), route, 0)).toEqual({ index: 0, offset: 4 });
    // Perto do canto (10,0), mas já no segmento 1: índice 1, 3 m dentro dele.
    expect(projectOnRoute(p(11, 3), route, 1)).toEqual({ index: 1, offset: 3 });
  });

  it('fecha com sampleRoute: projetar e amostrar volta ao mesmo ponto', () => {
    const route = circle();
    const random = lcg(7);
    for (let i = 0; i < 50; i++) {
      const a = random() * Math.PI * 2;
      const onRoute = p(Math.cos(a) * CIRCLE_RADIUS, Math.sin(a) * CIRCLE_RADIUS);
      const projected = projectOnRoute(onRoute, route, nearestRoutePoint(onRoute, route));
      const back = sampleRoute(route, projected.index, projected.offset);
      expect(Math.hypot(back.x - onRoute.x, back.z - onRoute.z)).toBeLessThan(0.1);
    }
  });
});

describe('crossesGate', () => {
  // Linha de chegada em x=5 no primeiro lado do quadrado, sentido +x.
  const gate: RouteGate = { ...p(5, 0), nx: 1, nz: 0, halfWidth: 3 };

  it('conta a passagem para a frente', () => {
    expect(crossesGate(p(4, 0), p(6, 0), gate)).toBe(true);
  });

  it('não conta de ré, nem fora da pista, nem por cima, nem teleporte', () => {
    expect(crossesGate(p(6, 0), p(4, 0), gate)).toBe(false); // de ré
    expect(crossesGate(p(4, 5), p(6, 5), gate)).toBe(false); // fora da largura
    expect(crossesGate(p(4, 0, 5), p(6, 0, 5), gate)).toBe(false); // viaduto por cima
    expect(crossesGate(p(-10, 0), p(10, 0), gate)).toBe(false); // salto de 20 m
  });

  it('parar em cima da linha e sair não conta duas vezes', () => {
    expect(crossesGate(p(4, 0), p(5, 0), gate)).toBe(true);
    expect(crossesGate(p(5, 0), p(6, 0), gate)).toBe(false);
  });
});

describe('sectorProgress', () => {
  it('mede a fração percorrida do setor', () => {
    const route = square();
    expect(sectorProgress(p(0, 0), route, 0, 2)).toBe(0);
    expect(sectorProgress(p(10, 0), route, 0, 2)).toBe(0.5);
    expect(sectorProgress(p(10, 10), route, 0, 2)).toBe(1);
  });

  it('só projeta nos segmentos do setor', () => {
    // (0,5) está no lado 3, fora do setor 0→2: o melhor dentro dele é (0,0).
    expect(sectorProgress(p(0, 5), square(), 0, 2)).toBe(0);
  });
});

describe('routeCurvature e routeFrame', () => {
  it('curvatura de três pontos de um círculo é 1/raio', () => {
    const route = circle();
    expect(routeCurvature(route[0]!, route[1]!, route[2]!)).toBeCloseTo(1 / CIRCLE_RADIUS, 4);
    expect(routeCurvature(p(0, 0), p(1, 0), p(2, 0))).toBe(0);
  });

  it('direção de percurso unitária ao longo de um lado reto', () => {
    const frame = routeFrame(square(), 0, 5);
    expect(frame.point).toEqual(p(5, 0));
    expect(frame.dx).toBeCloseTo(1, 12);
    expect(frame.dz).toBeCloseTo(0, 12);
  });
});
