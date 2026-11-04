/**
 * O espelho só manda linha do que mudou de verdade (SPEC-0678): rotação reescrita
 * com o mesmo valor não suja, e a varredura em rodízio pula nó oculto e nó sem
 * flag do quadro.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Quaternion } from 'three';
import { NativeSceneMirror, SWEEP_PERIOD_FRAMES } from '../../src/core/NativeSceneMirror.js';

/** Layouts que o espelho usa (ver `scene_mirror.h`). */
const FLOATS_POR_NO = 21;
const SYNC_FLOATS_POR_NO = 12;
const SYNC_FLAGS = 11;
const SYNC_MATERIAL_VISIVEL = 2;

/** Ponte falsa mínima: guarda as linhas de cada `update`. */
function instalarPonte(capacidade = 64): { linhas: number[][] } {
  const matrizes = new Float64Array(capacidade * 16);
  const sync = new Float64Array(capacidade * SYNC_FLOATS_POR_NO);
  const registro = { linhas: [] as number[][] };
  (globalThis as Record<string, unknown>)['__cortexSceneMirror'] = {
    build: (descricao: Float32Array) => descricao.length / FLOATS_POR_NO <= capacidade,
    worldMatrices: () => matrizes,
    syncBuffer: () => sync,
    update: (quantas: number) => {
      for (let i = 0; i < quantas; i++) {
        registro.linhas.push(Array.from(sync.subarray(i * SYNC_FLOATS_POR_NO, (i + 1) * SYNC_FLOATS_POR_NO)));
      }
      return quantas;
    },
  };
  return registro;
}

function cenaComFilhos(...filhos: Object3D[]): Object3D {
  const cena = new Object3D();
  for (const f of filhos) cena.add(f);
  return cena;
}

const camera = new PerspectiveCamera();

function quadro(espelho: NativeSceneMirror, registro: { linhas: number[][] }): number[][] {
  registro.linhas = [];
  espelho.update(camera);
  return registro.linhas;
}

describe('NativeSceneMirror — só o sujo de verdade (SPEC-0678)', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
  });

  it('o padrão do Object3DSyncSystem com valor igual não manda linha', () => {
    const registro = instalarPonte();
    const no = new Object3D();
    no.rotation.order = 'YXZ';
    no.rotation.y = 0.5;
    const espelho = new NativeSceneMirror();
    expect(espelho.install(cenaComFilhos(no))).toBe(true);
    quadro(espelho, registro);
    for (let i = 0; i < 3; i++) {
      no.position.set(0, 0, 0);
      no.rotation.order = 'YXZ';
      no.rotation.y = 0.5;
      expect(quadro(espelho, registro)).toHaveLength(0);
    }
  });

  it('quaternion.set/copy com o mesmo valor não manda linha', () => {
    const registro = instalarPonte();
    const no = new Object3D();
    no.quaternion.set(0, 0.6, 0, 0.8);
    const espelho = new NativeSceneMirror();
    espelho.install(cenaComFilhos(no));
    quadro(espelho, registro);
    no.quaternion.set(0, 0.6, 0, 0.8);
    no.quaternion.copy(new Quaternion(0, 0.6, 0, 0.8));
    expect(quadro(espelho, registro)).toHaveLength(0);
  });

  it('rotação que muda manda a linha com o quaternion novo', () => {
    const registro = instalarPonte();
    const no = new Object3D();
    const espelho = new NativeSceneMirror();
    espelho.install(cenaComFilhos(no));
    quadro(espelho, registro);
    no.rotation.y = Math.PI / 2;
    const linhas = quadro(espelho, registro);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]![5]).toBeCloseTo(no.quaternion.y, 12);
    expect(linhas[0]![7]).toBeCloseTo(no.quaternion.w, 12);
    // Voltar ao valor anterior também é mudança.
    no.rotation.y = 0;
    expect(quadro(espelho, registro)).toHaveLength(1);
  });

  it('a varredura pula o nó oculto; ao reaparecer a linha leva as flags do quadro', () => {
    const registro = instalarPonte();
    const m = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const espelho = new NativeSceneMirror();
    espelho.install(cenaComFilhos(m));
    quadro(espelho, registro);
    m.visible = false;
    expect(quadro(espelho, registro)).toHaveLength(1);
    (m.material as MeshBasicMaterial).visible = false;
    for (let i = 0; i < SWEEP_PERIOD_FRAMES; i++) expect(quadro(espelho, registro)).toHaveLength(0);
    m.visible = true;
    const linhas = quadro(espelho, registro);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]![SYNC_FLAGS]! & SYNC_MATERIAL_VISIVEL).toBe(0);
  });

  it('a varredura pula Object3D sem material, mas segue vendo a malha', () => {
    const registro = instalarPonte();
    const puro = new Object3D();
    const m = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const espelho = new NativeSceneMirror();
    espelho.install(cenaComFilhos(puro, m));
    quadro(espelho, registro);
    puro.frustumCulled = false;
    for (let i = 0; i < SWEEP_PERIOD_FRAMES; i++) expect(quadro(espelho, registro)).toHaveLength(0);
    m.frustumCulled = false;
    let linhas = 0;
    for (let i = 0; i < SWEEP_PERIOD_FRAMES; i++) linhas += quadro(espelho, registro).length;
    expect(linhas).toBe(1);
  });
});
