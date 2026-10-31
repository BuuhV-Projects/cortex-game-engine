import { describe, it, expect, afterEach } from 'vitest';
import {
  ClampToEdgeWrapping,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Texture,
} from 'three';
import { ShadowAlphaClipSync } from '../../src/render/ShadowAlphaClipSync.js';

/** Ponte falsa com a forma do `__cortexShadowAlphaClip` do host. */
function instalarPonteFalsa() {
  const sets: { no: number; textura: unknown; passo: number; alphaTest: number; wrapS: number; matriz: number[] }[] = [];
  const erases: number[] = [];
  (globalThis as Record<string, unknown>)['__cortexShadowAlphaClip'] = {
    set: (no: number, textura: unknown, _uv: unknown, passo: number, _desl: number, alphaTest: number, wrapS: number, _wrapT: number, m: Float32Array) => {
      sets.push({ no, textura, passo, alphaTest, wrapS, matriz: [...m] });
      return true;
    },
    erase: (no: number) => erases.push(no),
  };
  return { sets, erases };
}

/** Backend falso: só o que foi "subido" tem handle de GPU. */
function backendFalso() {
  const subidos = new Map<unknown, { buffer?: unknown; texture?: unknown }>();
  return {
    subidos,
    subir(malha: Mesh): void {
      const material = malha.material as MeshStandardMaterial;
      subidos.set(material.map, { texture: { nome: 'textura' } });
      subidos.set(malha.geometry.getAttribute('uv'), { buffer: { nome: 'uv' } });
    },
    get: (alvo: unknown) => subidos.get(alvo),
  };
}

/** Folha com recorte: `alphaTest` + `map`, como o MASK do glTF. */
function folha(): Mesh {
  const mapa = new Texture();
  mapa.wrapS = RepeatWrapping;
  return new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ map: mapa, alphaTest: 0.5 }));
}

function espelhoFalso(nos: Object3D[]) {
  return {
    alphaClipNodes: new Set(nos),
    nodeIndex: (o: Object3D) => (nos.indexOf(o) >= 0 ? nos.indexOf(o) + 1 : undefined),
    generation: 1,
  };
}

describe('ShadowAlphaClipSync (SPEC-0642)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexShadowAlphaClip'];
  });

  it('manda o recorte uma vez e não repete sem mudança', () => {
    const { sets } = instalarPonteFalsa();
    const malha = folha();
    const backend = backendFalso();
    backend.subir(malha);
    const sync = new ShadowAlphaClipSync();
    const espelho = espelhoFalso([malha]);
    sync.sync(espelho, backend);
    sync.sync(espelho, backend);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ no: 1, alphaTest: 0.5, passo: 8, wrapS: RepeatWrapping });
    // Matriz identidade da `Matrix3` (offset 0, repeat 1).
    expect(sets[0]!.matriz.map((v) => v + 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('espera o upload: sem handle de GPU não manda nada', () => {
    const { sets } = instalarPonteFalsa();
    const malha = folha();
    const backend = backendFalso();
    const sync = new ShadowAlphaClipSync();
    sync.sync(espelhoFalso([malha]), backend);
    expect(sets).toHaveLength(0);
    backend.subir(malha);
    sync.sync(espelhoFalso([malha]), backend);
    expect(sets).toHaveLength(1);
  });

  it('reenvia quando a transformação do UV (atlas) ou o wrap mudam', () => {
    const { sets } = instalarPonteFalsa();
    const malha = folha();
    const backend = backendFalso();
    backend.subir(malha);
    const sync = new ShadowAlphaClipSync();
    const espelho = espelhoFalso([malha]);
    sync.sync(espelho, backend);
    const mapa = (malha.material as MeshStandardMaterial).map!;
    mapa.offset.set(0.5, 0);
    mapa.repeat.set(0.5, 1);
    sync.sync(espelho, backend);
    expect(sets).toHaveLength(2);
    expect(sets[1]!.matriz[0]).toBeCloseTo(0.5);
    expect(sets[1]!.matriz[6]).toBeCloseTo(0.5);
    mapa.wrapS = ClampToEdgeWrapping;
    sync.sync(espelho, backend);
    expect(sets).toHaveLength(3);
  });

  it('apaga no host quando a textura some (dispose no three)', () => {
    const { sets, erases } = instalarPonteFalsa();
    const malha = folha();
    const backend = backendFalso();
    backend.subir(malha);
    const sync = new ShadowAlphaClipSync();
    const espelho = espelhoFalso([malha]);
    sync.sync(espelho, backend);
    backend.subidos.delete((malha.material as MeshStandardMaterial).map);
    sync.sync(espelho, backend);
    expect(sets).toHaveLength(1);
    expect(erases).toEqual([1]);
  });

  it('não registra o que o host não reproduz (alphaMap): o gate segue recusando', () => {
    const { sets } = instalarPonteFalsa();
    const malha = folha();
    (malha.material as MeshStandardMaterial).alphaMap = new Texture();
    const backend = backendFalso();
    backend.subir(malha);
    new ShadowAlphaClipSync().sync(espelhoFalso([malha]), backend);
    expect(sets).toHaveLength(0);
  });

  it('manda de novo quando o espelho renasce (geração nova)', () => {
    const { sets } = instalarPonteFalsa();
    const malha = folha();
    const backend = backendFalso();
    backend.subir(malha);
    const sync = new ShadowAlphaClipSync();
    const espelho = espelhoFalso([malha]);
    sync.sync(espelho, backend);
    sync.sync({ ...espelho, generation: 2 }, backend);
    expect(sets).toHaveLength(2);
  });

  it('é inerte sem a ponte do host (browser, Studio)', () => {
    const malha = folha();
    expect(() => new ShadowAlphaClipSync().sync(espelhoFalso([malha]), backendFalso())).not.toThrow();
  });
});
