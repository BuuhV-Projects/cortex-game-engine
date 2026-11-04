// Versão do mundo por candidato (SPEC-0682): a projeção a repassa e o RS1 pula a matriz.
import { describe, it, expect } from 'vitest';
import { BoxGeometry, Color, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Texture, type Object3D } from 'three';
import { checkRecording, snapshot, type CleanRoLike } from '../../src/render/CleanDrawFastPath.js';
import { CheckResult, NO_VERSION, RenderServer, type ServerAccess } from '../../src/render/RenderServer.js';
import { MainProjector, type RenderListLike } from '../../src/render/NativeMainProjection.js';
import { MainPassKind } from '../../src/render/MainPassKind.js';
import type { MainPassBridge, NativeSceneMirror } from '../../src/core/NativeSceneMirror.js';

/** Gravação mínima do b.1 com instantâneo válido (matriz identidade). */
function gravacao() {
  const geometry = { id: 1, attributes: { position: { id: 10, version: 0 } }, index: { id: 11, version: 0 }, drawRange: { start: 0, count: Infinity } };
  const object = { matrixWorld: new Matrix4(), geometry, receiveShadow: true };
  const material = new MeshBasicMaterial({ color: new Color(1, 0, 0), map: new Texture() }) as unknown as Record<string, unknown>;
  const ro = { object, material, geometry } as unknown as CleanRoLike;
  const out: number[] = [];
  expect(snapshot(ro, [], out)).toBe(true);
  return { g: { ro, vigias: [], instantaneo: new Float64Array(out), versaoDoMundo: NO_VERSION }, object, material };
}

describe('checkRecording (RS1 com versão do mundo, SPEC-0682)', () => {
  it('sem versão confere a matriz e não adota nada', () => {
    const { g, object } = gravacao();
    expect(checkRecording(g, NO_VERSION)).toBe(CheckResult.Clean);
    expect(g.versaoDoMundo).toBe(NO_VERSION);
    object.matrixWorld.elements[12] = 3;
    expect(checkRecording(g, NO_VERSION)).toBe(CheckResult.Moved);
  });

  it('adota a versão quando a matriz bate e, com a mesma versão, pula a matriz', () => {
    const { g, object } = gravacao();
    expect(checkRecording(g, 7)).toBe(CheckResult.Clean);
    expect(g.versaoDoMundo).toBe(7);
    // Mesma versão = o host garante a mesma matriz: a comparação não roda (prova: mexer sem trocar a versão).
    object.matrixWorld.elements[12] = 3;
    expect(checkRecording(g, 7)).toBe(CheckResult.Clean);
    // Versão nova: compara de verdade e acusa o movimento, sem adotar.
    expect(checkRecording(g, 8)).toBe(CheckResult.Moved);
    expect(g.versaoDoMundo).toBe(7);
  });

  it('o resto do instantâneo é conferido mesmo com a versão adotada', () => {
    const { g, material } = gravacao();
    checkRecording(g, 7);
    (material as { version: number }).version++;
    expect(checkRecording(g, 7)).toBe(CheckResult.Dirty);
  });
});

describe('RenderServer repassa a versão (SPEC-0682)', () => {
  function servidor(versoes: number[], nativas: number[]) {
    const access = {
      recordingOf: () => undefined,
      check: (_g: unknown, v: number) => (versoes.push(v), CheckResult.Clean),
    } as unknown as ServerAccess;
    const s = new RenderServer(access);
    s.attachNative({ beginFrame: () => undefined, take: (_o, _m, _g, v) => (nativas.push(v ?? -99), null), recipeFor: () => -1 });
    return s;
  }

  it('offer e offerNative entregam a versão ao renderer nativo; o padrão é NO_VERSION', () => {
    const nativas: number[] = [];
    const s = servidor([], nativas);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    s.offer(mesh, mesh.material, mesh.geometry, null, 0, 42);
    s.offerNative(mesh, mesh.material, mesh.geometry, null, 0, 43);
    s.offer(mesh, mesh.material, mesh.geometry, null, 0);
    expect(nativas).toEqual([42, 43, NO_VERSION]);
  });
});

describe('MainProjector repassa a versão do host (SPEC-0682)', () => {
  interface Oferta { tipo: string; versao: number }

  function montar(comVersoes: boolean) {
    const scene = new Scene();
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const inst = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1);
    inst.frustumCulled = false;
    scene.add(mesh, inst);
    scene.updateMatrixWorld(true);
    const nodes: Object3D[] = [scene, mesh, inst];
    const kinds = new Uint8Array([MainPassKind.None, MainPassKind.NativeCull, MainPassKind.JsCull]);
    const argumentos: number[] = [];
    const ponte: MainPassBridge = {
      worldVersions: comVersoes,
      setBounds: () => undefined,
      project(_p, _vp, indices, depths, versions) {
        argumentos.push(versions === undefined ? 4 : 5);
        indices[0] = 1;
        indices[1] = 2;
        depths[0] = depths[1] = 0;
        if (versions) {
          versions[0] = 11;
          versions[1] = 12;
        }
        return 2;
      },
    };
    const espelho = {
      installed: true, root: scene, syncPending: () => undefined, _projectionView: () => ({ nodes, kinds }),
    } as unknown as NativeSceneMirror;
    const ofertas: Oferta[] = [];
    const server = {
      offer: (_o: unknown, _m: unknown, _g: unknown, _c: unknown, _z: number, v: number) => (ofertas.push({ tipo: 'rs', versao: v }), true),
      offerNative: (_o: unknown, _m: unknown, _g: unknown, _c: unknown, _z: number, v: number) => (ofertas.push({ tipo: 'nat', versao: v }), true),
    };
    const lista: RenderListLike = { push: () => undefined, pushLight: () => undefined };
    const camera = new PerspectiveCamera();
    camera.updateMatrixWorld();
    const stats = { native: 0, refused: 0, candidates: 0 };
    expect(new MainProjector(espelho, ponte, stats).project(camera, lista, null, server as never)).toBe(true);
    return { argumentos, ofertas };
  }

  it('com o host que publica worldVersions, passa o 5º argumento e a versão de cada candidato', () => {
    const { argumentos, ofertas } = montar(true);
    expect(argumentos).toEqual([5]);
    expect(ofertas).toEqual([{ tipo: 'rs', versao: 11 }, { tipo: 'nat', versao: 12 }]);
  });

  it('host antigo: 4 argumentos e NO_VERSION (o caminho de antes)', () => {
    const { argumentos, ofertas } = montar(false);
    expect(argumentos).toEqual([4]);
    expect(ofertas).toEqual([{ tipo: 'rs', versao: NO_VERSION }, { tipo: 'nat', versao: NO_VERSION }]);
  });
});
