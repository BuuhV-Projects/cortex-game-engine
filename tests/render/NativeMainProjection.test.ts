import { describe, it, expect } from 'vitest';
import {
  BoxGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  LOD,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  Sprite,
  Vector4,
  type Camera,
  type Material,
} from 'three';
import {
  MainPassKind,
  mainPassFrameFlags,
  mainPassKind,
  mainPassNodeFlags,
  mainPassUnsupported,
  NODE_LIGHT,
  NODE_MAIN_CULL,
  NODE_MAIN_FRUSTUM_CULLED,
  NODE_MAIN_JS_CULL,
  NODE_MAIN_UNSUPPORTED,
  SYNC_FRUSTUM_CULLED,
  SYNC_MAIN_UNSUPPORTED,
} from '../../src/render/MainPassKind.js';
import {
  installNativeProjection,
  type ProjectingRendererLike,
  type RenderListLike,
} from '../../src/render/NativeMainProjection.js';
import type { MainPassBridge, NativeSceneMirror } from '../../src/core/NativeSceneMirror.js';

const FRUSTUM_FLOATS = 24;
const FLOATS_PER_PLANE = 4;

describe('MainPassKind', () => {
  it('classifica como os ramos do _projectObject', () => {
    expect(mainPassKind(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))).toBe(MainPassKind.NativeCull);
    expect(mainPassKind(new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2))).toBe(MainPassKind.JsCull);
    expect(mainPassKind(new Sprite())).toBe(MainPassKind.JsCull);
    expect(mainPassKind(new DirectionalLight())).toBe(MainPassKind.Light);
    expect(mainPassKind(new Group())).toBe(MainPassKind.None);
    expect(mainPassKind(new Object3D())).toBe(MainPassKind.None);
  });

  it('recusa o que a projeção nativa não reproduz', () => {
    const g = new Group();
    expect(mainPassUnsupported(g)).toBe(false);
    g.renderOrder = 2;
    expect(mainPassUnsupported(g)).toBe(true);
    expect(mainPassUnsupported(new LOD())).toBe(true);
    // `renderOrder` de MALHA não é `groupOrder`: entra no sort pelo item.
    const m = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    m.renderOrder = 3;
    expect(mainPassUnsupported(m)).toBe(false);
  });

  it('bits de autoria e do quadro', () => {
    const m = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    expect(mainPassNodeFlags(m)).toBe(NODE_MAIN_CULL | NODE_MAIN_FRUSTUM_CULLED);
    m.frustumCulled = false;
    expect(mainPassNodeFlags(m)).toBe(NODE_MAIN_CULL);
    expect(mainPassFrameFlags(m)).toBe(0);
    expect(mainPassNodeFlags(new DirectionalLight()) & NODE_LIGHT).toBe(NODE_LIGHT);
    expect(mainPassNodeFlags(new Sprite()) & NODE_MAIN_JS_CULL).toBe(NODE_MAIN_JS_CULL);
    const lod = new LOD();
    expect(mainPassNodeFlags(lod) & NODE_MAIN_UNSUPPORTED).toBe(NODE_MAIN_UNSUPPORTED);
    expect(mainPassFrameFlags(lod)).toBe(SYNC_FRUSTUM_CULLED | SYNC_MAIN_UNSUPPORTED);
  });
});

// ── Projeção: ponte de referência que reproduz o C++ em JS ──────────────────

interface Cena {
  scene: Scene;
  nodes: Object3D[];
  kinds: Uint8Array;
}

/** Ordem em largura (pai antes de filho), como o `install` do espelho. */
function montarCena(scene: Scene): Cena {
  scene.updateMatrixWorld(true);
  const nodes: Object3D[] = [];
  const fila: Object3D[] = [scene];
  while (fila.length > 0) {
    const o = fila.shift()!;
    nodes.push(o);
    fila.push(...o.children);
  }
  const kinds = new Uint8Array(nodes.length);
  nodes.forEach((o, i) => (kinds[i] = mainPassKind(o)));
  return { scene, nodes, kinds };
}

/** O que o `main_pass_culler.cpp` faz, com as matrizes do `three`. */
function ponteDeReferencia(cena: Cena): MainPassBridge & { chamadas: number } {
  const ponte = {
    chamadas: 0,
    setBounds: () => undefined,
    project(planes: Float64Array, vp: Float64Array, indices: Int32Array, depths: Float64Array): number {
      ponte.chamadas++;
      const efetivo = new Map<Object3D, boolean>();
      let n = 0;
      for (let i = 0; i < cena.nodes.length; i++) {
        const o = cena.nodes[i]!;
        const vis = (o.parent ? efetivo.get(o.parent) !== false : true) && o.visible;
        efetivo.set(o, vis);
        if (!vis) continue;
        if (mainPassUnsupported(o)) {
          indices[0] = i;
          return -1;
        }
        const tipo = cena.kinds[i];
        if (tipo === MainPassKind.Light || tipo === MainPassKind.JsCull) {
          indices[n] = i;
          depths[n++] = 0;
          continue;
        }
        if (tipo !== MainPassKind.NativeCull) continue;
        const g = (o as Mesh).geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const s = new Sphere().copy(g.boundingSphere!).applyMatrix4(o.matrixWorld);
        let dentro = true;
        for (let p = 0; p < FRUSTUM_FLOATS; p += FLOATS_PER_PLANE) {
          const d = planes[p]! * s.center.x + planes[p + 1]! * s.center.y + planes[p + 2]! * s.center.z + planes[p + 3]!;
          if (d < -s.radius) dentro = false;
        }
        if (o.frustumCulled && !dentro) continue;
        indices[n] = i;
        depths[n++] = vp[2]! * s.center.x + vp[6]! * s.center.y + vp[10]! * s.center.z + vp[14]!;
      }
      return n;
    },
  };
  return ponte;
}

function espelhoFalso(cena: Cena, instalado = true): NativeSceneMirror {
  return {
    installed: instalado,
    root: cena.scene,
    syncPending: () => undefined,
    _projectionView: () => ({ nodes: cena.nodes, kinds: cena.kinds }),
  } as unknown as NativeSceneMirror;
}

interface Item {
  object: Object3D;
  material: Material;
  z: number;
  group: unknown;
}

function listaFalsa(): RenderListLike & { itens: Item[]; luzes: Object3D[] } {
  const itens: Item[] = [];
  const luzes: Object3D[] = [];
  return {
    itens,
    luzes,
    push: (object, _geometry, material, _groupOrder, z, group) => itens.push({ object, material, z, group }),
    pushLight: (l) => luzes.push(l),
  };
}

function camera(): Camera {
  const c = new PerspectiveCamera(60, 1, 0.1, 1000);
  c.updateMatrixWorld();
  return c;
}

function malha(nome: string, z: number, material: Material | Material[] = new MeshBasicMaterial()): Mesh {
  const m = new Mesh(new BoxGeometry(), material);
  m.name = nome;
  m.position.z = z;
  return m;
}

describe('installNativeProjection', () => {
  it('monta a RenderList com os mesmos itens que o _projectObject empurraria', () => {
    const scene = new Scene();
    const dentro = malha('dentro', -10);
    const semMaterial = malha('semMaterial', -10);
    (semMaterial.material as Material).visible = false;
    const escondido = new Group();
    escondido.visible = false;
    escondido.add(malha('filhoDeEscondido', -10));
    const atras = malha('atras', 50);
    const invisivelMasMaterial = malha('materialVisivelGrupoFilho', -12);
    invisivelMasMaterial.material = new MeshBasicMaterial({ visible: false });
    invisivelMasMaterial.add(malha('filhoDeSemMaterial', -12)); // o filho continua desenhando
    const mats = [new MeshBasicMaterial(), new MeshBasicMaterial({ visible: false })];
    const geo = new BoxGeometry();
    geo.clearGroups();
    geo.addGroup(0, 6, 0);
    geo.addGroup(6, 6, 1);
    const multi = new Mesh(geo, mats);
    multi.position.z = -20;
    const outraCamada = malha('outraCamada', -10);
    outraCamada.layers.set(2);
    const luz = new DirectionalLight();
    const instancias = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1);
    instancias.position.z = 500; // atrás da câmera: o JS corta pela esfera do objeto
    scene.add(dentro, semMaterial, escondido, atras, invisivelMasMaterial, multi, outraCamada, luz, instancias);
    const cena = montarCena(scene);
    const ponte = ponteDeReferencia(cena);
    const original = { chamadas: 0 };
    const renderer: ProjectingRendererLike = {
      sortObjects: true,
      _projectObject: () => void original.chamadas++,
    };
    const handle = installNativeProjection(renderer, espelhoFalso(cena), ponte)!;
    const lista = listaFalsa();
    const cam = camera();
    renderer._projectObject!(scene, cam, 0, lista, null);

    expect(ponte.chamadas).toBe(1);
    expect(original.chamadas).toBe(0);
    expect(lista.itens.map((i) => i.object.name || 'multi').sort()).toEqual(
      ['dentro', 'filhoDeSemMaterial', 'multi'].sort(),
    );
    const doMulti = lista.itens.find((i) => i.object === multi)!;
    expect(doMulti.material).toBe(mats[0]);
    expect(doMulti.group).toBe(geo.groups[0]);
    expect(lista.luzes).toEqual([luz]);

    // `z` = o do `three`: centro da esfera × matrixWorld × viewProj, sem dividir por w.
    const vp = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const esperado = new Vector4().copy(dentro.geometry.boundingSphere!.center as unknown as Vector4)
      .applyMatrix4(dentro.matrixWorld)
      .applyMatrix4(vp).z;
    expect(lista.itens.find((i) => i.object === dentro)!.z).toBeCloseTo(esperado, 9);
    expect(handle.stats.native).toBe(1);
  });

  it('InstancedMesh visível entra com o z do three', () => {
    const scene = new Scene();
    const instancias = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1);
    instancias.position.z = -5;
    scene.add(instancias);
    const cena = montarCena(scene);
    const renderer: ProjectingRendererLike = { sortObjects: true, _projectObject: () => undefined };
    installNativeProjection(renderer, espelhoFalso(cena), ponteDeReferencia(cena));
    const lista = listaFalsa();
    const cam = camera();
    renderer._projectObject!(scene, cam, 0, lista, null);
    expect(lista.itens.length).toBe(1);
    // O `three` usa o centro da esfera da GEOMETRIA para o `z`, mesmo instanciado.
    const vp = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    expect(lista.itens[0]!.z).toBeCloseTo(new Vector4(0, 0, -5, 1).applyMatrix4(vp).z, 9);
  });

  it('devolve ao three: subárvore, cena não espelhada, sortObjects=false e recusa do host', () => {
    const scene = new Scene();
    const filho = new Object3D();
    scene.add(filho);
    const cena = montarCena(scene);
    const original = { chamadas: 0 };
    const renderer: ProjectingRendererLike = { sortObjects: true, _projectObject: () => void original.chamadas++ };
    const ponte = ponteDeReferencia(cena);
    const handle = installNativeProjection(renderer, espelhoFalso(cena), ponte)!;
    const lista = listaFalsa();
    const cam = camera();

    renderer._projectObject!(filho, cam, 0, lista, null); // recursão/subárvore
    renderer._projectObject!(new Scene(), cam, 0, lista, null); // outra cena (UI, quad)
    renderer.sortObjects = false;
    renderer._projectObject!(scene, cam, 0, lista, null);
    expect(original.chamadas).toBe(3);
    expect(ponte.chamadas).toBe(0);

    renderer.sortObjects = true;
    const lod = new LOD();
    scene.add(lod);
    const comLod = montarCena(scene);
    const renderer2: ProjectingRendererLike = { sortObjects: true, _projectObject: () => void original.chamadas++ };
    installNativeProjection(renderer2, espelhoFalso(comLod), ponteDeReferencia(comLod));
    renderer2._projectObject!(scene, cam, 0, lista, null);
    expect(original.chamadas).toBe(4);

    handle.uninstall();
    expect(Object.prototype.hasOwnProperty.call(renderer, '_projectObject')).toBe(true);
  });

  it('sem a ponte do host não instala', () => {
    const renderer: ProjectingRendererLike = { _projectObject: () => undefined };
    const cena = montarCena(new Scene());
    expect(installNativeProjection(renderer, espelhoFalso(cena), undefined)).toBeNull();
  });
});
