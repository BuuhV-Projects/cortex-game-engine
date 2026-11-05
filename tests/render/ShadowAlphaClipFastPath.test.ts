/**
 * Caminho rápido do recorte alfa (SPEC-0690 §7): em regime o nó já mandado sai sem consultar o provedor, e volta a
 * ler a fonte quando algo do objeto muda (UV do atlas, wrap), quando o provedor troca um buffer, ou quando o mapa ou
 * a geometria são descartados (o handle de GPU some com eles).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, RepeatWrapping, Texture } from 'three';
import { ShadowAlphaClipSync, type FonteDeUvETextura } from '../../src/render/ShadowAlphaClipSync.js';
import type { ShadowUvSlot } from '../../src/render/ShadowGeometrySource.js';

const ALPHA_TEST = 0.5;
/** Passo do UV simples (2 floats) no slot falso. */
const UV_STRIDE = 8;
const ATLAS_OFFSET = 0.25;

function instalarPonte() {
  const sets: number[] = [];
  const erases: number[] = [];
  (globalThis as Record<string, unknown>)['__cortexShadowAlphaClip'] = {
    set: (no: number) => {
      sets.push(no);
      return true;
    },
    erase: (no: number) => erases.push(no),
  };
  return { sets, erases };
}

/** Provedor falso: textura e UV sempre presentes, com o aviso de troca de buffer. */
function fonteFalsa() {
  const ouvintes = new Set<(source: object) => void>();
  const buffer = { label: 'uv' };
  const fonte = {
    texture: vi.fn((mapa: unknown) => (mapa ? { gpu: mapa } : null)),
    uv: vi.fn((_geometria: unknown, out: ShadowUvSlot) => {
      out.buffer = buffer;
      out.stride = UV_STRIDE;
      out.offset = 0;
      return true;
    }),
    onBufferReplaced(cb: (source: object) => void) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    trocar(): void {
      ouvintes.forEach((cb) => cb(buffer));
    },
  };
  return fonte;
}

function folha(): Mesh {
  return new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ map: new Texture(), alphaTest: ALPHA_TEST }));
}

function espelho(nos: Object3D[]) {
  return { alphaClipNodes: new Set(nos), nodeIndex: (o: Object3D) => nos.indexOf(o) + 1, generation: 1 };
}

const backend = { get: () => undefined };

function montar() {
  const ponte = instalarPonte();
  const fonte = fonteFalsa();
  const malha = folha();
  const sync = new ShadowAlphaClipSync();
  const e = espelho([malha]);
  const rodar = () => sync.sync(e, backend, fonte as unknown as FonteDeUvETextura);
  rodar();
  fonte.uv.mockClear();
  fonte.texture.mockClear();
  return { ...ponte, fonte, malha, mapa: (malha.material as MeshStandardMaterial).map!, rodar };
}

describe('ShadowAlphaClipSync: caminho rápido em regime', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexShadowAlphaClip'];
  });

  it('nó já mandado e sem mudança não consulta o provedor nem reenvia', () => {
    const { sets, fonte, rodar } = montar();
    for (let i = 0; i < 5; i++) rodar();
    expect(fonte.uv).not.toHaveBeenCalled();
    expect(fonte.texture).not.toHaveBeenCalled();
    expect(sets).toHaveLength(1);
  });

  it('o offset do atlas (matriz automática) muda: relê e reenvia', () => {
    const { sets, mapa, fonte, rodar } = montar();
    mapa.offset.x = ATLAS_OFFSET;
    rodar();
    expect(fonte.uv).toHaveBeenCalledTimes(1);
    expect(sets).toHaveLength(2);
  });

  it('o wrap muda: relê e reenvia', () => {
    const { sets, mapa, rodar } = montar();
    mapa.wrapS = RepeatWrapping;
    rodar();
    expect(sets).toHaveLength(2);
  });

  it('o provedor troca um buffer: todo nó relê a fonte uma vez', () => {
    const { fonte, rodar } = montar();
    fonte.trocar();
    rodar();
    rodar();
    expect(fonte.uv).toHaveBeenCalledTimes(1);
  });

  it('o dispose do mapa faz reler; sem textura no provedor, o host apaga o recorte', () => {
    const { erases, mapa, fonte, rodar } = montar();
    fonte.texture.mockReturnValue(null);
    mapa.dispose();
    rodar();
    expect(erases).toEqual([1]);
  });

  it('o dispose da geometria faz reler a fonte', () => {
    const { malha, fonte, rodar } = montar();
    malha.geometry.dispose();
    rodar();
    expect(fonte.uv).toHaveBeenCalledTimes(1);
  });

  it('matriz manual (sem matrixAutoUpdate) é sempre relida: o jogo pode tê-la mudado', () => {
    const { mapa, fonte, rodar } = montar();
    mapa.matrixAutoUpdate = false;
    rodar();
    rodar();
    expect(fonte.uv).toHaveBeenCalledTimes(2);
  });
});
