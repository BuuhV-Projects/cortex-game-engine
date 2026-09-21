import { describe, expect, it, beforeEach } from 'vitest';
import {
  geometryBuffers,
  geometryId,
  geometryIdRegistrado,
  resetGeometryIds,
} from '../../src/render/GeometryDesc.js';

/** Backend falso: devolve o buffer que o teste associou a cada atributo. */
function backendFake(mapa: Map<unknown, unknown>) {
  return {
    get(alvo: unknown) {
      const buffer = mapa.get(alvo);
      return buffer === undefined ? undefined : { buffer };
    },
  };
}

/** Geometria mínima com a forma que o módulo consulta. */
function geometriaFake(opcoes: {
  posicao?: { count: number } | null;
  indice?: { count: number } | null;
}) {
  const { posicao = { count: 24 }, indice = null } = opcoes;
  return {
    getAttribute: (nome: string) => (nome === 'position' ? posicao : undefined),
    index: indice,
  } as never;
}

describe('geometryId', () => {
  beforeEach(() => resetGeometryIds());

  it('devolve o MESMO id para a mesma geometria', () => {
    const geometria = {};
    expect(geometryId(geometria)).toBe(geometryId(geometria));
  });

  it('não gasta id novo em malhas que compartilham a geometria', () => {
    // As rodas de um carro compartilham a mesma BufferGeometry: se cada
    // instância ganhasse um id, a tabela do C++ cresceria à toa e a mesma
    // geometria seria registrada várias vezes.
    const compartilhada = {};
    const ids = [compartilhada, compartilhada, compartilhada].map(geometryId);
    expect(new Set(ids).size).toBe(1);
  });

  it('dá ids diferentes a geometrias diferentes', () => {
    expect(geometryId({})).not.toBe(geometryId({}));
  });

  it('nunca usa 0, que fica reservado para "sem geometria"', () => {
    expect(geometryId({})).toBeGreaterThan(0);
  });

  it('só reporta registrado depois de ter dado id', () => {
    const geometria = {};
    expect(geometryIdRegistrado(geometria)).toBe(false);
    geometryId(geometria);
    expect(geometryIdRegistrado(geometria)).toBe(true);
  });
});

describe('geometryBuffers', () => {
  it('lê os buffers que o three já criou, sem criar cópia', () => {
    const posicao = { count: 24 };
    const indice = { count: 36 };
    const geometria = geometriaFake({ posicao, indice });
    const backend = backendFake(
      new Map<unknown, unknown>([
        [posicao, 'buffer-de-vertice'],
        [indice, 'buffer-de-indice'],
      ]),
    );

    const buffers = geometryBuffers(backend, geometria);
    expect(buffers).toEqual({
      vertexBuffer: 'buffer-de-vertice',
      indexBuffer: 'buffer-de-indice',
      indexCount: 36,
      vertexCount: 0,
    });
  });

  it('trata malha não indexada pela contagem de vértices', () => {
    const posicao = { count: 3 };
    const geometria = geometriaFake({ posicao, indice: null });
    const backend = backendFake(new Map<unknown, unknown>([[posicao, 'vb']]));

    expect(geometryBuffers(backend, geometria)).toEqual({
      vertexBuffer: 'vb',
      indexBuffer: null,
      indexCount: 0,
      vertexCount: 3,
    });
  });

  it('recusa quando o three ainda não subiu a geometria', () => {
    const posicao = { count: 24 };
    const geometria = geometriaFake({ posicao });
    // Backend vazio: o atributo existe, mas ainda não tem buffer de GPU.
    expect(geometryBuffers(backendFake(new Map()), geometria)).toBeNull();
  });

  it('recusa índice declarado sem buffer, em vez de desenhar sem ele', () => {
    // Desenhar ignorando o índice mudaria a malha na tela — é o tipo de
    // diferença sutil que esta migração precisa evitar.
    const posicao = { count: 24 };
    const indice = { count: 36 };
    const geometria = geometriaFake({ posicao, indice });
    const backend = backendFake(new Map<unknown, unknown>([[posicao, 'vb']]));
    expect(geometryBuffers(backend, geometria)).toBeNull();
  });

  it('recusa geometria sem nada para desenhar', () => {
    const posicao = { count: 0 };
    const geometria = geometriaFake({ posicao, indice: null });
    const backend = backendFake(new Map<unknown, unknown>([[posicao, 'vb']]));
    expect(geometryBuffers(backend, geometria)).toBeNull();
  });

  it('recusa geometria sem atributo de posição', () => {
    const geometria = geometriaFake({ posicao: null });
    expect(geometryBuffers(backendFake(new Map()), geometria)).toBeNull();
  });
});
