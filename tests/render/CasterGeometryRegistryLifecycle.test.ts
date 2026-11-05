/**
 * Ciclo de vida do registro de geometria dos casters com o provedor do ADR-0692: `dispose` solta o ouvinte de troca
 * de buffer, a recusada descartada sai da contagem e do host, a geometria ainda sem dados fica pendente, e a cópia
 * que só a sombra usa acompanha a `version` e passa para o buffer do three quando ele existe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Object3D } from 'three';
import { CasterGeometryRegistry } from '../../src/render/CasterGeometryRegistry.js';
import { geometryId, resetGeometryIds } from '../../src/render/GeometryDesc.js';
import { NativeGeometryStore } from '../../src/render/native/NativeGeometryStore.js';
import { NativeShadowSource } from '../../src/render/native/NativeShadowSource.js';
import { POSITION_FORMAT_REFUSAL, type ShadowGeometrySource } from '../../src/render/ShadowGeometrySource.js';
import type { NativeRendererHost } from '../../src/render/native/nativeRendererShared.js';

function instalarRegistroFalso() {
  const registradas = new Map<number, unknown>();
  const chamadas = { register: vi.fn(), unregister: vi.fn() };
  (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'] = {
    register: (id: number, vertexBuffer: unknown) => {
      chamadas.register(id);
      if (!vertexBuffer) return false;
      registradas.set(id, vertexBuffer);
      return true;
    },
    unregister: (id: number) => {
      chamadas.unregister(id);
      registradas.delete(id);
    },
    size: () => registradas.size,
  };
  return { registradas, chamadas };
}

const backendVazio = { get: () => undefined };

function triangulo(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  return g;
}

function cenaCom(geometria: BufferGeometry): Object3D {
  const cena = new Object3D();
  cena.add(new Mesh(geometria, new MeshBasicMaterial()));
  return cena;
}

/** Provedor nativo com um `three` falso (o mapa diz quem o three já subiu) e o device contando escritas. */
function provedorNativo(three = new Map<object, unknown>()) {
  const device = {
    createBuffer: (d: { size: number }) => ({ size: d.size }),
    queue: { writeBuffer: vi.fn() },
  };
  const host = {
    backend: { get: (o: unknown) => (three.has(o as object) ? { buffer: three.get(o as object) } : {}) },
    _textures: {},
  } as unknown as NativeRendererHost;
  const store = new NativeGeometryStore(device, host);
  return { device, store, fonte: new NativeShadowSource(store, host) };
}

describe('CasterGeometryRegistry — ciclo de vida (ADR-0692)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexGeometryRegistry'];
    resetGeometryIds();
  });

  it('dispose desregistra no host o que registrou, solta o ouvinte e não mexe mais no host', () => {
    const { chamadas } = instalarRegistroFalso();
    const ouvintes = new Set<(fonte: object) => void>();
    const off = vi.fn();
    const g = triangulo();
    const fonte: ShadowGeometrySource = {
      kind: 'falso',
      uploadedBytes: 0,
      buffers: () => ({ vertexBuffer: {}, indexBuffer: null, indexCount: 0, vertexCount: 3, indexIs32Bit: false, vertexStride: 12, vertexOffset: 0 }),
      uv: () => false,
      texture: () => null,
      onBufferReplaced(ouvinte) {
        ouvintes.add(ouvinte);
        return () => (off(), ouvintes.delete(ouvinte));
      },
    };
    const registro = new CasterGeometryRegistry();
    registro.atualizar(cenaCom(g), backendVazio, [], fonte);
    registro.dispose();
    // O host faz AddRef (ADR-0692): sem o unregister o buffer ficaria preso com a cena descartada.
    expect(chamadas.unregister).toHaveBeenCalledWith(geometryId(g));
    expect(off).toHaveBeenCalledTimes(1);
    expect(ouvintes.size).toBe(0);
    chamadas.register.mockClear();
    chamadas.unregister.mockClear();
    ouvintes.forEach((o) => o(g.getAttribute('position')));
    g.dispose();
    expect(chamadas.register).not.toHaveBeenCalled();
    expect(chamadas.unregister).not.toHaveBeenCalled();
  });

  it('a recusada descartada sai da contagem e do host; depois do limpar, o dispose não chama nada', () => {
    const { chamadas } = instalarRegistroFalso();
    const recusa: ShadowGeometrySource = {
      kind: 'falso', uploadedBytes: 0, buffers: () => POSITION_FORMAT_REFUSAL, uv: () => false, texture: () => null,
    };
    const g = triangulo();
    const registro = new CasterGeometryRegistry();
    registro.atualizar(cenaCom(g), backendVazio, [], recusa);
    expect(registro.recusadas).toBe(1);
    expect(registro.estado(g)).toBe(POSITION_FORMAT_REFUSAL);
    g.dispose();
    expect(registro.recusadas).toBe(0);
    expect(registro.estado(g)).toBe('desconhecida');
    expect(chamadas.unregister).toHaveBeenCalledWith(geometryId(g));

    const outra = triangulo();
    const segundo = new CasterGeometryRegistry();
    segundo.atualizar(cenaCom(outra), backendVazio, [], recusa);
    segundo.limpar();
    chamadas.unregister.mockClear();
    outra.dispose();
    expect(chamadas.unregister).not.toHaveBeenCalled();
  });

  it('geometria sem position fica pendente e entra quando ganha dados', () => {
    const { registradas } = instalarRegistroFalso();
    const { fonte } = provedorNativo();
    const g = new BufferGeometry();
    const registro = new CasterGeometryRegistry();
    expect(registro.atualizar(cenaCom(g), backendVazio, [], fonte)).toEqual({ registradas: 0, pendentes: 1 });
    expect(registro.estado(g)).toBe('pendente');
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    expect(registro.atualizar(cenaCom(g), backendVazio, [], fonte)).toEqual({ registradas: 1, pendentes: 0 });
    expect(registradas.has(geometryId(g))).toBe(true);
  });

  it('cópia só da sombra segue a version e passa ao buffer do three quando ele existe', () => {
    const { registradas } = instalarRegistroFalso();
    const three = new Map<object, unknown>();
    const { device, fonte } = provedorNativo(three);
    const g = triangulo();
    const cena = cenaCom(g);
    const registro = new CasterGeometryRegistry();
    registro.atualizar(cena, backendVazio, [], fonte);
    const id = geometryId(g);
    const copia = registradas.get(id);
    // O three desenha a malha (recusa do NativeRenderer) e mexe na position na CPU.
    g.getAttribute('position').needsUpdate = true;
    const escritas = device.queue.writeBuffer.mock.calls.length;
    registro.atualizar(cena, backendVazio, [], fonte);
    expect(device.queue.writeBuffer.mock.calls.length).toBe(escritas + 1);
    expect(device.queue.writeBuffer.mock.calls.at(-1)![0]).toBe(copia);
    // O three subiu a cópia dele: o id passa a apontá-la, e a do store sai.
    three.set(g.getAttribute('position'), { three: 'vertices' });
    registro.atualizar(cena, backendVazio, [], fonte);
    expect(registradas.get(id)).toEqual({ three: 'vertices' });
    expect(registro.estado(g)).toBe('registrada');
  });
});
