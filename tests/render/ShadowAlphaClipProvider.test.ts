/**
 * Recorte alfa do passe de sombra com o provedor do ADR-0692: UV pelo slot do provedor (simples e intercalado),
 * textura ausente subida pelo caminho do material nativo, e o nó que sai do espelho e volta ao MESMO slot manda o
 * `set` de novo (o host apagou o slot no `removeSubtree`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Texture,
} from 'three';
import { ShadowAlphaClipSync, type FonteDeUvETextura } from '../../src/render/ShadowAlphaClipSync.js';
import { NativeGeometryStore } from '../../src/render/native/NativeGeometryStore.js';
import { NativeShadowSource } from '../../src/render/native/NativeShadowSource.js';
import { NativeSceneMirror } from '../../src/core/NativeSceneMirror.js';
import type { NativeRendererHost } from '../../src/render/native/nativeRendererShared.js';
import type { ShadowUvSlot } from '../../src/render/ShadowGeometrySource.js';

/** Floats de um vértice intercalado (posição 3 + uv 2) e onde o uv começa. */
const STRIDE = 5;
const UV_AT = 3;
const FLOAT_BYTES = 4;
const ALPHA_TEST = 0.5;

function instalarPonte() {
  const sets: { no: number; textura: unknown; uv: unknown; passo: number; deslocamento: number }[] = [];
  (globalThis as Record<string, unknown>)['__cortexShadowAlphaClip'] = {
    set: (no: number, textura: unknown, uv: unknown, passo: number, deslocamento: number) => {
      sets.push({ no, textura, uv, passo, deslocamento });
      return true;
    },
    erase: vi.fn(),
  };
  return sets;
}

function folha(geometria: BufferGeometry = new PlaneGeometry(1, 1)): Mesh {
  return new Mesh(geometria, new MeshStandardMaterial({ map: new Texture(), alphaTest: ALPHA_TEST }));
}

function intercalada(): BufferGeometry {
  const g = new BufferGeometry();
  const bloco = new InterleavedBuffer(new Float32Array(STRIDE * 3), STRIDE);
  g.setAttribute('position', new InterleavedBufferAttribute(bloco, 3, 0));
  g.setAttribute('uv', new InterleavedBufferAttribute(bloco, 2, UV_AT));
  return g;
}

/** Espelho falso com o aviso de saída de nó (como o `NativeSceneMirror`). */
function espelhoFalso(nos: Object3D[]) {
  const ouvintes = new Set<(o: Object3D) => void>();
  const vivos = new Set(nos);
  return {
    alphaClipNodes: vivos,
    nodeIndex: (o: Object3D) => (vivos.has(o) ? nos.indexOf(o) + 1 : undefined),
    generation: 1,
    onAlphaClipRemoved(o: (objeto: Object3D) => void) {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    sair(o: Object3D): void {
      vivos.delete(o);
      ouvintes.forEach((cb) => cb(o));
    },
    voltar(o: Object3D): void {
      vivos.add(o);
    },
  };
}

/** Host nativo falso: o three não tem nada; `updateTexture` "sobe" a textura. */
function hostNativo() {
  const dados = new Map<unknown, Record<string, unknown>>();
  const host = {
    backend: { get: (o: unknown) => dados.get(o) ?? {} },
    _textures: {
      updateTexture: vi.fn((t: { version: number }) => dados.set(t, { texture: { gpu: 'mapa' }, version: t.version })),
      updateSampler: vi.fn(),
    },
  } as unknown as NativeRendererHost;
  const device = { createBuffer: (d: { size: number }) => ({ size: d.size }), queue: { writeBuffer: () => undefined } };
  return { host, fonte: new NativeShadowSource(new NativeGeometryStore(device, host), host) };
}

const backendVazio = { get: () => undefined };

/** Passo de um UV `float32x2` simples, em bytes. */
const PASSO_DO_UV = 8;

/** O provedor falso preenche o destino de quem chama, como os reais. */
function slotFalso(out: ShadowUvSlot, buffer: unknown): boolean {
  out.buffer = buffer;
  out.stride = PASSO_DO_UV;
  out.offset = 0;
  return true;
}

describe('ShadowAlphaClipSync com provedor (ADR-0692)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexShadowAlphaClip'];
    delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
  });

  it('UV simples pelo provedor: o slot dele, passo 8 e deslocamento 0', () => {
    const sets = instalarPonte();
    const malha = folha();
    const fonte: FonteDeUvETextura = { uv: (_g, out) => slotFalso(out, 'uv-nativo'), texture: () => 'tex' };
    new ShadowAlphaClipSync().sync(espelhoFalso([malha]), backendVazio, fonte);
    expect(sets).toEqual([{ no: 1, textura: 'tex', uv: 'uv-nativo', passo: 8, deslocamento: 0 }]);
  });

  it('UV intercalado pelo store nativo: passo do bloco e deslocamento do uv', () => {
    const sets = instalarPonte();
    const { fonte } = hostNativo();
    new ShadowAlphaClipSync().sync(espelhoFalso([folha(intercalada())]), backendVazio, fonte);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ passo: STRIDE * FLOAT_BYTES, deslocamento: UV_AT * FLOAT_BYTES, textura: { gpu: 'mapa' } });
    expect(sets[0]!.uv).toBeTruthy();
  });

  it('em regime o provedor não é consultado: nada mudou no objeto nem no provedor', () => {
    instalarPonte();
    const { fonte } = hostNativo();
    const uv = vi.spyOn(fonte, 'uv');
    const sync = new ShadowAlphaClipSync();
    const espelho = espelhoFalso([folha(intercalada())]);
    sync.sync(espelho, backendVazio, fonte);
    sync.sync(espelho, backendVazio, fonte);
    expect(uv).toHaveBeenCalledTimes(1);
    expect(uv.mock.results[0]!.value).toBe(true);
  });

  it('a textura padrão 1×1 do three (sem version no backend) não vale como o mapa: dispara o upload real', () => {
    const mapa = new Texture();
    mapa.version = 1;
    // Como o `createDefaultTexture` do three: o backend tem uma textura, mas sem a `version` do mapa.
    const dados = new Map<unknown, Record<string, unknown>>([[mapa, { texture: { gpu: 'padrao' } }]]);
    const updateTexture = vi.fn((t: Texture) => dados.set(t, { texture: { gpu: 'real' }, version: t.version }));
    const host = {
      backend: { get: (o: unknown) => dados.get(o) ?? {} },
      _textures: { updateTexture, updateSampler: vi.fn() },
    } as unknown as NativeRendererHost;
    const device = { createBuffer: (d: { size: number }) => ({ size: d.size }), queue: { writeBuffer: () => undefined } };
    const fonte = new NativeShadowSource(new NativeGeometryStore(device, host), host);
    expect(fonte.texture(mapa)).toEqual({ gpu: 'real' });
    expect(updateTexture).toHaveBeenCalledWith(mapa);
  });

  it('textura que o three nunca subiu dispara o upload do caminho nativo', () => {
    const sets = instalarPonte();
    const { host, fonte } = hostNativo();
    const malha = folha();
    new ShadowAlphaClipSync().sync(espelhoFalso([malha]), backendVazio, fonte);
    expect(host._textures.updateTexture).toHaveBeenCalledWith((malha.material as MeshStandardMaterial).map);
    expect(sets).toHaveLength(1);
  });

  it('o nó que sai do espelho e volta ao mesmo slot manda o set de novo', () => {
    const sets = instalarPonte();
    const malha = folha();
    const espelho = espelhoFalso([malha]);
    const fonte: FonteDeUvETextura = { uv: (_g, out) => slotFalso(out, 'uv'), texture: () => 'tex' };
    const sync = new ShadowAlphaClipSync();
    sync.sync(espelho, backendVazio, fonte);
    sync.sync(espelho, backendVazio, fonte);
    expect(sets).toHaveLength(1);
    espelho.sair(malha);
    sync.sync(espelho, backendVazio, fonte);
    espelho.voltar(malha);
    sync.sync(espelho, backendVazio, fonte);
    expect(sets).toHaveLength(2);
    expect(sets[1]!.no).toBe(1);
  });

  it('o NativeSceneMirror avisa a saída de um nó com recorte no removeSubtree', () => {
    const matrizes = new Float64Array(16 * 8);
    (globalThis as Record<string, unknown>)['__cortexSceneMirror'] = {
      build: () => true,
      worldMatrices: () => matrizes,
      syncBuffer: () => new Float64Array(12 * 8),
      update: () => 0,
    };
    const malha = folha();
    const cena = new Object3D();
    cena.add(malha);
    const espelho = new NativeSceneMirror();
    expect(espelho.install(cena)).toBe(true);
    espelho.update(new PerspectiveCamera());
    expect(espelho.alphaClipNodes.has(malha)).toBe(true);
    const saiu = vi.fn();
    espelho.onAlphaClipRemoved(saiu);
    cena.remove(malha);
    expect(saiu).toHaveBeenCalledWith(malha);
  });
});
