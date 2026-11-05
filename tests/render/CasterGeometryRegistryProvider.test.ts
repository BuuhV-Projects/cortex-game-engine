/**
 * O registro de geometria dos casters com o provedor do ADR-0692: store nativo quando o three está vazio, orçamento
 * de upload por quadro, geometria drenada do espelho no mesmo quadro, re-registro quando o buffer é refeito e
 * desregistro no `dispose`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, type BufferGeometry } from 'three';
import { CasterGeometryRegistry, SHADOW_UPLOAD_BYTES_PER_FRAME } from '../../src/render/CasterGeometryRegistry.js';
import { geometryId, resetGeometryIds, type GeometryBuffers } from '../../src/render/GeometryDesc.js';
import { NativeGeometryStore } from '../../src/render/native/NativeGeometryStore.js';
import { NativeShadowSource } from '../../src/render/native/NativeShadowSource.js';
import type { ShadowBuffersResult, ShadowGeometrySource } from '../../src/render/ShadowGeometrySource.js';
import type { NativeRendererHost } from '../../src/render/native/nativeRendererShared.js';

/** Bytes que o provedor falso "sobe" por geometria: um terço do orçamento, então cabem 3 por quadro. */
const BYTES_POR_GEOMETRIA = Math.ceil(SHADOW_UPLOAD_BYTES_PER_FRAME / 3);

function instalarRegistroFalso() {
  const registradas = new Map<number, unknown>();
  const chamadas = { register: 0, unregister: 0 };
  (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'] = {
    register: (id: number, vertexBuffer: unknown) => {
      chamadas.register++;
      if (!vertexBuffer) return false;
      registradas.set(id, vertexBuffer);
      return true;
    },
    unregister: (id: number) => {
      chamadas.unregister++;
      registradas.delete(id);
    },
    size: () => registradas.size,
  };
  return { registradas, chamadas };
}

function buffersDe(handle: unknown): GeometryBuffers {
  return { vertexBuffer: handle, indexBuffer: null, indexCount: 0, vertexCount: 3, vertexStride: 12, vertexOffset: 0, indexIs32Bit: false };
}

/** Provedor falso: `prontas` já têm buffer; o resto só com `upload`, contando bytes. */
function provedorFalso() {
  const prontas = new Map<BufferGeometry, unknown>();
  const ouvintes = new Set<(fonte: object) => void>();
  const pedidos: { geometria: BufferGeometry; upload: boolean }[] = [];
  let versao = 0;
  const fonte: ShadowGeometrySource & { uploadedBytes: number } = {
    kind: 'falso',
    uploadedBytes: 0,
    buffers(geometria: BufferGeometry, upload: boolean): ShadowBuffersResult {
      pedidos.push({ geometria, upload });
      const pronta = prontas.get(geometria);
      if (pronta) return buffersDe(pronta);
      if (!upload) return null;
      fonte.uploadedBytes += BYTES_POR_GEOMETRIA;
      const handle = { subida: geometryId(geometria), versao };
      prontas.set(geometria, handle);
      return buffersDe(handle);
    },
    uv: () => false,
    texture: () => null,
    onBufferReplaced(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
  return {
    fonte,
    prontas,
    pedidos,
    /** Refaz o buffer da `position` de `geometria` e avisa, como o store nativo. */
    trocar(geometria: BufferGeometry): void {
      versao++;
      prontas.delete(geometria);
      const posicao = geometria.getAttribute('position') as unknown as object;
      ouvintes.forEach((o) => o(posicao));
    },
  };
}

const backendVazio = { get: () => undefined };

function cenaCom(n: number): { cena: Object3D; malhas: Mesh[] } {
  const cena = new Object3D();
  const malhas: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    malhas.push(m);
    cena.add(m);
  }
  return { cena, malhas };
}

describe('CasterGeometryRegistry com provedor (ADR-0692)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'];
    resetGeometryIds();
  });

  it('registra pelo store nativo quando o three está vazio', () => {
    const { registradas } = instalarRegistroFalso();
    const { cena, malhas } = cenaCom(1);
    const device = { createBuffer: (d: { size: number }) => ({ size: d.size }), queue: { writeBuffer: () => undefined } };
    const host = { backend: { get: () => ({}) }, _textures: {} } as unknown as NativeRendererHost;
    const fonte = new NativeShadowSource(new NativeGeometryStore(device, host), host);
    const registro = new CasterGeometryRegistry();
    expect(registro.atualizar(cena, backendVazio, [], fonte)).toEqual({ registradas: 1, pendentes: 0 });
    expect(registradas.get(geometryId(malhas[0]!.geometry))).toMatchObject({ size: expect.any(Number) });
  });

  it('prefere o buffer que já existe: não pede upload de quem está pronto', () => {
    instalarRegistroFalso();
    const { cena, malhas } = cenaCom(1);
    const p = provedorFalso();
    p.prontas.set(malhas[0]!.geometry, { three: true });
    new CasterGeometryRegistry().atualizar(cena, backendVazio, [], p.fonte);
    expect(p.fonte.uploadedBytes).toBe(0);
    expect(p.pedidos).toHaveLength(1);
  });

  it('a varredura respeita o orçamento de upload ao longo dos quadros', () => {
    instalarRegistroFalso();
    const { cena } = cenaCom(7);
    const p = provedorFalso();
    const registro = new CasterGeometryRegistry();
    // Cabem 3 por quadro (o 3º fecha o orçamento): 3, 6, 7.
    expect(registro.atualizar(cena, backendVazio, [], p.fonte)).toEqual({ registradas: 3, pendentes: 4 });
    expect(registro.atualizar(cena, backendVazio, [], p.fonte)).toEqual({ registradas: 6, pendentes: 1 });
    expect(registro.atualizar(cena, backendVazio, [], p.fonte)).toEqual({ registradas: 7, pendentes: 0 });
  });

  it('geometria drenada do espelho sobe no mesmo quadro, fora do orçamento', () => {
    instalarRegistroFalso();
    const { cena } = cenaCom(3);
    const p = provedorFalso();
    const registro = new CasterGeometryRegistry();
    registro.atualizar(cena, backendVazio, [], p.fonte);
    const lods = cenaCom(4).malhas.map((m) => m.geometry);
    // Orçamento de um quadro dá 3; as 4 drenadas entram todas, de uma vez.
    expect(registro.atualizar(cena, backendVazio, lods, p.fonte)).toEqual({ registradas: 7, pendentes: 0 });
  });

  it('formato recusado sai da fila com o motivo e marca o id no host (9º argumento)', () => {
    instalarRegistroFalso();
    const marcas: unknown[][] = [];
    const ponte = (globalThis as unknown as Record<string, { register: (...a: unknown[]) => boolean }>)['__cortexGeometryRegistry']!;
    const original = ponte.register;
    ponte.register = (...args: unknown[]) => (marcas.push(args), original(...args));
    const { cena, malhas } = cenaCom(1);
    const p = provedorFalso();
    p.fonte.buffers = () => 'posicao-nao-float32x3';
    const registro = new CasterGeometryRegistry();
    expect(registro.atualizar(cena, backendVazio, [], p.fonte)).toEqual({ registradas: 0, pendentes: 0 });
    expect(marcas).toEqual([[geometryId(malhas[0]!.geometry), null, null, 0, 0, false, 0, 0, false]]);
    // Não é tentado de novo no quadro seguinte.
    registro.atualizar(cena, backendVazio, [], p.fonte);
    expect(marcas).toHaveLength(1);
    expect(registro.estado(malhas[0]!.geometry)).toBe('posicao-nao-float32x3');
    expect(registro.recusadas).toBe(1);
    expect(registro.resumo).toContain('recusadas=1 fonte=falso');
  });

  it('registra o mesmo id de novo com o handle novo quando o buffer é refeito', () => {
    const { registradas, chamadas } = instalarRegistroFalso();
    const { cena, malhas } = cenaCom(1);
    const p = provedorFalso();
    const registro = new CasterGeometryRegistry();
    registro.atualizar(cena, backendVazio, [], p.fonte);
    const id = geometryId(malhas[0]!.geometry);
    const antes = registradas.get(id);
    p.trocar(malhas[0]!.geometry);
    expect(registradas.get(id)).not.toBe(antes);
    expect(registradas.get(id)).toMatchObject({ versao: 1 });
    expect(chamadas.unregister).toBe(0);
    expect(registro.estado(malhas[0]!.geometry)).toBe('registrada');
  });

  it('o dispose desregistra, também depois de um re-registro', () => {
    const { registradas } = instalarRegistroFalso();
    const { cena, malhas } = cenaCom(1);
    const p = provedorFalso();
    const registro = new CasterGeometryRegistry();
    registro.atualizar(cena, backendVazio, [], p.fonte);
    p.trocar(malhas[0]!.geometry);
    malhas[0]!.geometry.dispose();
    expect(registradas.size).toBe(0);
    expect(registro.total).toBe(0);
    // Depois do dispose, a troca de buffer não ressuscita o registro.
    p.trocar(malhas[0]!.geometry);
    expect(registradas.size).toBe(0);
  });

  it('sem como registrar o buffer novo, desregistra e volta para a fila', () => {
    const { registradas } = instalarRegistroFalso();
    const { cena, malhas } = cenaCom(1);
    const p = provedorFalso();
    const registro = new CasterGeometryRegistry();
    registro.atualizar(cena, backendVazio, [], p.fonte);
    const subir = p.fonte.buffers;
    p.fonte.buffers = () => null;
    p.trocar(malhas[0]!.geometry);
    expect(registradas.size).toBe(0);
    expect(registro.estado(malhas[0]!.geometry)).toBe('pendente');
    p.fonte.buffers = subir;
    expect(registro.atualizar(cena, backendVazio, [], p.fonte)).toEqual({ registradas: 1, pendentes: 0 });
  });
});
