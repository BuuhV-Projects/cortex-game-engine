/**
 * Camadas e esfera do OBJETO no culling nativo (SPEC-0686): a RenderList sai
 * igual à do caminho antigo (host sem os recursos, o JS testando camada e
 * esfera), o JS deixa de testar quem o host corta, e os ganchos de camadas do
 * espelho mandam a `layers.mask` ao host na hora da escrita que muda o valor.
 *
 * O host falso abaixo: o `__cortexSceneMirror` guarda as linhas de
 * sincronização e o `__cortexMainPass` reproduz o `main_pass_culler.cpp` em JS
 * (camadas, esfera do objeto, pass-through), com as matrizes que o teste compõe
 * na memória "nativa".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Bone,
  BoxGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Frustum,
  InstancedMesh,
  Layers,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Skeleton,
  Sphere,
  Vector3,
  Object3D as Object3DClass,
  SkinnedMesh,
  Sprite,
  Uint16BufferAttribute,
  type Material,
  type Object3D,
} from 'three';
import { NativeSceneMirror } from '../../src/core/NativeSceneMirror.js';
import { MainPassKind, mainPassUnsupported } from '../../src/render/MainPassKind.js';
import { mainPassBridge } from '../../src/core/sceneMirror/mirrorBridge.js';
import { MainProjector, type RenderListLike } from '../../src/render/NativeMainProjection.js';

const FLOATS_POR_NO = 21;
const SYNC_FLOATS_POR_NO = 12;
const SYNC_FLAGS = 11;
const SYNC_FRUSTUM_CULLED = 1 << 4;
const PLANOS = 24;
const POR_PLANO = 4;
const TODAS_AS_CAMADAS = 0xffffffff;
const CAMADAS_PADRAO = 1;

interface EsferaDoObjeto {
  centro: Vector3;
  raio: number;
  profundidade: Vector3;
}

interface FakeHost {
  /** Capacidades do passe principal novo (SPEC-0686) ligadas? */
  readonly novo: boolean;
  chamadas: { setLayers: number; setObjectSphere: number; clearObjectSphere: number; resetSlots: number; project: number };
  camadas: Map<number, number>;
  esferas: Map<number, EsferaDoObjeto>;
  /** Candidatos devolvidos na última projeção. */
  ultimos: number;
  /** Depois do `install`: liga o host aos nós e fotografa o `frustumCulled` do `build`. */
  ligar(espelho: NativeSceneMirror): void;
  /** Compõe as matrizes de mundo na memória nativa (o `updateAndCull` do C++). */
  compor(): void;
}

function instalarHostFalso(novo: boolean, capacidade = 64): FakeHost {
  const matrizes = new Float64Array(capacidade * 16);
  const sync = new Float64Array(capacidade * SYNC_FLOATS_POR_NO);
  const frustumPorSlot = new Map<number, boolean>();
  let espelho: NativeSceneMirror | null = null;
  const nos = (): readonly (Object3D | undefined)[] => espelho!._projectionView().nodes;
  const host: FakeHost = {
    novo,
    chamadas: { setLayers: 0, setObjectSphere: 0, clearObjectSphere: 0, resetSlots: 0, project: 0 },
    camadas: new Map(),
    esferas: new Map(),
    ultimos: 0,
    ligar(e) {
      espelho = e;
      nos().forEach((o, i) => o && frustumPorSlot.set(i, o.frustumCulled));
    },
    compor() {
      for (const o of nos()) {
        if (!o) continue;
        o.updateMatrix();
        if (o.parent) o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
        else o.matrixWorld.copy(o.matrix);
      }
    },
  };
  (globalThis as Record<string, unknown>)['__cortexSceneMirror'] = {
    build: (descricao: Float32Array) => descricao.length / FLOATS_POR_NO <= capacidade,
    worldMatrices: () => matrizes,
    syncBuffer: () => sync,
    update: (linhas: number) => {
      for (let i = 0; i < linhas; i++) {
        const b = i * SYNC_FLOATS_POR_NO;
        frustumPorSlot.set(sync[b]!, (sync[b + SYNC_FLAGS]! & SYNC_FRUSTUM_CULLED) !== 0);
      }
      return linhas;
    },
  };
  const passe: Record<string, unknown> = {
    worldVersions: true,
    setBounds: () => undefined,
    project(planes: Float64Array, vp: Float64Array, indices: Int32Array, depths: Float64Array, versions?: Float64Array, cameraLayers?: number) {
      host.chamadas.project++;
      const view = espelho!._projectionView();
      const efetivo = new Map<Object3D, boolean>();
      const camera = cameraLayers ?? TODAS_AS_CAMADAS;
      let n = 0;
      const empurrar = (i: number, z: number): void => {
        indices[n] = i;
        depths[n] = z;
        if (versions) versions[n] = 0;
        n++;
      };
      for (let i = 0; i < view.nodes.length; i++) {
        const o = view.nodes[i];
        if (!o) continue;
        const vis = (o.parent ? efetivo.get(o.parent) !== false : true) && o.visible;
        efetivo.set(o, vis);
        if (!vis) continue;
        if (mainPassUnsupported(o)) {
          indices[0] = i;
          return -1;
        }
        if (((host.camadas.get(i) ?? CAMADAS_PADRAO) & camera) === 0) continue;
        const tipo = view.kinds[i];
        const propria = tipo === MainPassKind.JsCull ? host.esferas.get(i) : undefined;
        if (tipo === MainPassKind.Light || (tipo === MainPassKind.JsCull && !propria)) {
          empurrar(i, 0);
          continue;
        }
        if (tipo !== MainPassKind.NativeCull && !propria) continue;
        const g = (o as Object3D & { geometry: { boundingSphere: Sphere | null; computeBoundingSphere(): void } }).geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const corte = propria ? new Sphere(propria.centro.clone(), propria.raio) : g.boundingSphere!.clone();
        corte.applyMatrix4(o.matrixWorld);
        let dentro = true;
        for (let p = 0; p < PLANOS; p += POR_PLANO) {
          const d = planes[p]! * corte.center.x + planes[p + 1]! * corte.center.y + planes[p + 2]! * corte.center.z + planes[p + 3]!;
          if (d < -corte.radius) dentro = false;
        }
        if (frustumPorSlot.get(i) !== false && !dentro) continue;
        const c = (propria ? propria.profundidade.clone() : g.boundingSphere!.center.clone()).applyMatrix4(o.matrixWorld);
        empurrar(i, vp[2]! * c.x + vp[6]! * c.y + vp[10]! * c.z + vp[14]!);
      }
      host.ultimos = n;
      return n;
    },
  };
  if (novo) {
    Object.assign(passe, {
      layerMask: true,
      objectSpheres: true,
      setLayers: (i: number, mask: number) => {
        host.chamadas.setLayers++;
        host.camadas.set(i, mask);
      },
      setObjectSphere: (i: number, ox: number, oy: number, oz: number, r: number, gx: number, gy: number, gz: number) => {
        host.chamadas.setObjectSphere++;
        host.esferas.set(i, { centro: new Vector3(ox, oy, oz), raio: r, profundidade: new Vector3(gx, gy, gz) });
      },
      clearObjectSphere: (i: number) => {
        host.chamadas.clearObjectSphere++;
        host.esferas.delete(i);
      },
      resetSlots: () => {
        host.chamadas.resetSlots++;
        host.camadas.clear();
        host.esferas.clear();
      },
    });
  }
  (globalThis as Record<string, unknown>)['__cortexMainPass'] = passe;
  return host;
}

const DISTANCIA = -10;
/** Deslocamento das instâncias: a esfera do OBJETO fica longe da da geometria. */
const DESLOCAMENTO = 40;
const CAMADA_2 = 2;
const CAMADA_3 = 3;
const VERTICES_DA_CAIXA = 24;
const PESOS_POR_VERTICE = 4;

interface Montagem {
  scene: Scene;
  noCamada2: Mesh;
  luzCamada2: DirectionalLight;
  instDentro: InstancedMesh;
  instFora: InstancedMesh;
  instNula: InstancedMesh;
  rig: SkinnedMesh;
}

function instancias(nome: string, x: number, z: number): InstancedMesh {
  const m = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2);
  m.name = nome;
  // As duas instâncias ficam deslocadas: o aglomerado (esfera do objeto) não é a origem do nó.
  m.setMatrixAt(0, new Matrix4().makeTranslation(x, 0, z));
  m.setMatrixAt(1, new Matrix4().makeTranslation(x + 1, 0, z));
  return m;
}

function rigMinimo(): SkinnedMesh {
  const g = new BoxGeometry();
  const indices = new Uint16Array(VERTICES_DA_CAIXA * PESOS_POR_VERTICE);
  const pesos = new Float32Array(VERTICES_DA_CAIXA * PESOS_POR_VERTICE);
  for (let v = 0; v < VERTICES_DA_CAIXA; v++) pesos[v * PESOS_POR_VERTICE] = 1;
  g.setAttribute('skinIndex', new Uint16BufferAttribute(indices, PESOS_POR_VERTICE));
  g.setAttribute('skinWeight', new Float32BufferAttribute(pesos, PESOS_POR_VERTICE));
  const rig = new SkinnedMesh(g, new MeshBasicMaterial());
  rig.name = 'rig';
  const osso = new Bone();
  rig.add(osso);
  rig.bind(new Skeleton([osso]));
  rig.position.z = DISTANCIA;
  return rig;
}

/** A mesma cena para os dois caminhos (cada um com o seu espelho). */
function montar(): Montagem {
  const scene = new Scene();
  const comum = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  comum.name = 'comum';
  comum.position.z = DISTANCIA;
  const noCamada2 = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  noCamada2.name = 'camada2';
  noCamada2.position.z = DISTANCIA;
  noCamada2.layers.set(CAMADA_2);
  const filhoDaCamada2 = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  filhoDaCamada2.name = 'filhoDaCamada2';
  noCamada2.add(filhoDaCamada2);
  const luzCamada2 = new DirectionalLight();
  luzCamada2.layers.set(CAMADA_2);
  // Nó na origem; instâncias na frente da câmera (dentro) ou muito ao lado (fora).
  const instDentro = instancias('instDentro', 0, DISTANCIA);
  const instFora = instancias('instFora', DESLOCAMENTO * 10, DISTANCIA);
  const instNula = instancias('instNula', 0, DISTANCIA);
  instNula.position.x = DESLOCAMENTO; // a origem do nó fica fora; as instâncias, não
  instNula.setMatrixAt(0, new Matrix4().makeTranslation(-DESLOCAMENTO, 0, DISTANCIA));
  instNula.setMatrixAt(1, new Matrix4().makeTranslation(-DESLOCAMENTO, 0, DISTANCIA));
  const sprite = new Sprite();
  sprite.name = 'sprite';
  sprite.position.z = DISTANCIA;
  const rig = rigMinimo();
  scene.add(comum, noCamada2, luzCamada2, instDentro, instFora, instNula, sprite, rig);
  // As esferas que o `three` já calculou (o `null` fica para o teste do quadro).
  instDentro.computeBoundingSphere();
  instFora.computeBoundingSphere();
  return { scene, noCamada2, luzCamada2, instDentro, instFora, instNula, rig };
}

interface Item {
  nome: string;
  material: Material;
  z: number;
}

function listaFalsa(): RenderListLike & { itens: Item[]; luzes: Object3D[] } {
  const itens: Item[] = [];
  const luzes: Object3D[] = [];
  return {
    itens,
    luzes,
    push: (object, _g, material, _o, z) => itens.push({ nome: object.name || object.type, material, z }),
    pushLight: (l) => luzes.push(l),
  };
}

interface Caminho {
  host: FakeHost;
  espelho: NativeSceneMirror;
  projetor: MainProjector;
  m: Montagem;
}

function caminho(novo: boolean): Caminho {
  const host = instalarHostFalso(novo);
  const m = montar();
  const espelho = new NativeSceneMirror();
  expect(espelho.install(m.scene)).toBe(true);
  host.ligar(espelho);
  return { host, espelho, projetor: new MainProjector(espelho, mainPassBridge()!, { native: 0, refused: 0, candidates: 0 }), m };
}

const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
camera.updateMatrixWorld();

/** Um quadro do caminho (o espelho e o projetor guardaram a ponte do construtor). */
function quadro(c: Caminho): { itens: Item[]; luzes: Object3D[] } {
  const lista = listaFalsa();
  c.espelho.update(camera);
  c.host.compor();
  expect(c.projetor.project(camera, lista, null)).toBe(true);
  return { itens: lista.itens, luzes: lista.luzes };
}

function comparar(antigo: ReturnType<typeof quadro>, novo: ReturnType<typeof quadro>): void {
  expect(novo.itens.map((i) => i.nome)).toEqual(antigo.itens.map((i) => i.nome));
  novo.itens.forEach((item, k) => expect(item.z).toBeCloseTo(antigo.itens[k]!.z, 9));
  expect(novo.luzes.length).toBe(antigo.luzes.length);
}

/** Roda o mesmo passo nos dois caminhos, cada um com o seu host instalado. */
function emPar(antigo: Caminho, novo: Caminho, passo: (m: Montagem) => void): void {
  passo(antigo.m);
  passo(novo.m);
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['__cortexSceneMirror'];
  delete (globalThis as Record<string, unknown>)['__cortexMainPass'];
  vi.restoreAllMocks();
});

describe('culling nativo com camadas e esfera do objeto (SPEC-0686)', () => {
  it('a RenderList é a do caminho antigo, quadro a quadro, com as mudanças em runtime', () => {
    const antigo = caminho(false);
    const novo = caminho(true);
    const primeiro = quadro(novo);
    comparar(quadro(antigo), primeiro);
    // Não é trivial: entram as instâncias da vista e o filho da camada 2; o pai, a luz e instFora não.
    expect([...primeiro.itens.map((i) => i.nome)].sort()).toEqual(['comum', 'filhoDaCamada2', 'instDentro', 'instNula', 'rig', 'sprite']);
    expect(primeiro.luzes).toEqual([]);
    // Segundo quadro: o `three` já calculou a esfera `null` (instNula, rig) no primeiro.
    comparar(quadro(antigo), quadro(novo));

    // Esfera do objeto mutada NO LUGAR (vegetação): o aglomerado sai da vista.
    emPar(antigo, novo, (m) => m.instDentro.boundingSphere!.center.set(DESLOCAMENTO * 10, 0, DISTANCIA));
    comparar(quadro(antigo), quadro(novo));
    // `frustumCulled` desligado: o que estava fora volta, no mesmo quadro.
    emPar(antigo, novo, (m) => (m.instFora.frustumCulled = false));
    comparar(quadro(antigo), quadro(novo));
    // Camadas: `set`, `Layers` novo, `Layers` compartilhado, `enableAll`.
    emPar(antigo, novo, (m) => m.noCamada2.layers.set(0));
    comparar(quadro(antigo), quadro(novo));
    emPar(antigo, novo, (m) => {
      const outra = new Layers();
      outra.set(CAMADA_3);
      m.noCamada2.layers = outra;
      m.luzCamada2.layers = outra;
    });
    comparar(quadro(antigo), quadro(novo));
    emPar(antigo, novo, (m) => m.noCamada2.layers.enableAll());
    const fim = quadro(novo);
    comparar(quadro(antigo), fim);
    expect(fim.itens.map((i) => i.nome)).toContain('camada2');
    expect(fim.luzes.length).toBe(1);
    // Esfera anulada (padrão de quem reescreve as instâncias): volta ao JS, que a recalcula.
    emPar(antigo, novo, (m) => (m.instDentro.boundingSphere = null));
    comparar(quadro(antigo), quadro(novo));
    comparar(quadro(antigo), quadro(novo));
  });

  it('menos trabalho: o host corta as instâncias e o JS não testa camada nem esfera delas', () => {
    const antigo = caminho(false);
    const novo = caminho(true);
    quadro(antigo);
    quadro(novo); // primeiro quadro: instNula e o rig calculam a esfera no teste do `three`
    const teste = vi.spyOn(Frustum.prototype, 'intersectsObject');
    const camadas = vi.spyOn(Layers.prototype, 'test');
    quadro(novo);
    expect(teste).not.toHaveBeenCalled();
    expect(camadas).not.toHaveBeenCalled();
    quadro(antigo);
    // Antigo: instDentro, instFora, instNula e o rig (o sprite usa `intersectsSprite`).
    expect(teste).toHaveBeenCalledTimes(4);
    expect(camadas).not.toHaveBeenCalled(); // o teste de camada em linha também não chama
    // O host novo não devolve a instância fora da vista nem os da camada 2.
    expect(novo.host.ultimos).toBeLessThan(antigo.host.ultimos);
  });

  it('parado, nada atravessa a ponte além do project', () => {
    const novo = caminho(true);
    quadro(novo);
    quadro(novo);
    const antes = { ...novo.host.chamadas };
    quadro(novo);
    quadro(novo);
    expect(novo.host.chamadas.setObjectSphere).toBe(antes.setObjectSphere);
    expect(novo.host.chamadas.setLayers).toBe(antes.setLayers);
    expect(novo.host.chamadas.clearObjectSphere).toBe(antes.clearObjectSphere);
    expect(novo.host.chamadas.project).toBe(antes.project + 2);
  });

  it('sprite e esfera nula ficam com o JS; o rig entra no host depois do primeiro teste', () => {
    const novo = caminho(true);
    const view = novo.espelho._projectionView();
    const slot = (o: Object3D): number => novo.espelho.nodeIndex(o)!;
    quadro(novo);
    expect(view.objectSpheres![slot(novo.m.instDentro)]).toBe(1);
    expect(view.objectSpheres![slot(novo.m.scene.getObjectByName('sprite')!)]).toBe(0);
    // `null` no início do quadro: o `three` calculou no teste; no próximo, vai ao host.
    expect(view.objectSpheres![slot(novo.m.rig)]).toBe(0);
    quadro(novo);
    expect(view.objectSpheres![slot(novo.m.rig)]).toBe(1);
    expect(view.objectSpheres![slot(novo.m.instNula)]).toBe(1);
  });
});

// ── Ganchos de camadas do espelho ───────────────────────────────────────

const CAMADA_31 = 31;
/** `layers.set(31)` do `three`: `(1 << 31 | 0) >>> 0`. */
const MASCARA_31 = 2 ** CAMADA_31;
const TODAS = -1;

function malha(): Mesh {
  return new Mesh(new BoxGeometry(), new MeshBasicMaterial());
}

function instalar(...filhos: Object3D[]): { host: FakeHost; espelho: NativeSceneMirror; cena: Object3D } {
  const host = instalarHostFalso(true);
  const cena = new Object3DClass();
  for (const f of filhos) cena.add(f);
  const espelho = new NativeSceneMirror();
  expect(espelho.install(cena)).toBe(true);
  host.ligar(espelho);
  return { host, espelho, cena };
}


describe('ganchos de camadas do espelho (SPEC-0686)', () => {
  it('install zera o host e só manda a máscara que não é a padrão', () => {
    const fora = malha();
    fora.layers.set(CAMADA_2);
    const { host, espelho } = instalar(malha(), fora, malha());
    expect(host.chamadas.resetSlots).toBe(1);
    expect(host.chamadas.setLayers).toBe(1);
    expect(host.camadas.get(espelho.nodeIndex(fora)!)).toBe(1 << CAMADA_2);
  });

  it('escrita que muda manda na hora; a mesma máscara não atravessa', () => {
    const m = malha();
    const { host, espelho } = instalar(m);
    const slot = espelho.nodeIndex(m)!;
    m.layers.set(CAMADA_2);
    expect(host.camadas.get(slot)).toBe(1 << CAMADA_2);
    const depois = host.chamadas.setLayers;
    m.layers.set(CAMADA_2);
    m.layers.mask = 1 << CAMADA_2;
    expect(host.chamadas.setLayers).toBe(depois);
    m.layers.enableAll();
    expect(host.camadas.get(slot)).toBe(TODAS);
    m.layers.set(CAMADA_31);
    expect(host.camadas.get(slot)).toBe(MASCARA_31);
    expect(m.layers.test(new Layers())).toBe(false);
  });

  it('Layers trocado inteiro e compartilhado avisa todos os slots que o usam', () => {
    const a = malha();
    const b = malha();
    const { host, espelho } = instalar(a, b);
    const comum = new Layers();
    comum.set(CAMADA_2);
    a.layers = comum;
    b.layers = comum;
    expect(host.camadas.get(espelho.nodeIndex(a)!)).toBe(1 << CAMADA_2);
    expect(host.camadas.get(espelho.nodeIndex(b)!)).toBe(1 << CAMADA_2);
    comum.set(0);
    expect(host.camadas.get(espelho.nodeIndex(a)!)).toBe(1);
    expect(host.camadas.get(espelho.nodeIndex(b)!)).toBe(1);
    expect(a.layers).toBe(comum);
  });

  it('nó que sai devolve as propriedades cruas; nó que entra manda a dele', () => {
    const m = malha();
    const { host, espelho, cena } = instalar(m);
    espelho.removeSubtree(m);
    cena.remove(m);
    expect(Object.getOwnPropertyDescriptor(m, 'layers')?.get).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(m.layers, 'mask')?.get).toBeUndefined();
    const antes = host.chamadas.setLayers;
    m.layers.set(CAMADA_2);
    expect(host.chamadas.setLayers).toBe(antes);
    expect(m.layers.mask).toBe(1 << CAMADA_2);
  });

  it('host sem o recurso: nada é enganchado nem mandado', () => {
    const host = instalarHostFalso(false);
    const m = malha();
    const cena = new Object3DClass();
    cena.add(m);
    const espelho = new NativeSceneMirror();
    expect(espelho.install(cena)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(m, 'layers')?.get).toBeUndefined();
    expect(espelho._projectionView().layersInHost).toBe(false);
    expect(espelho._projectionView().objectSpheres).toBeUndefined();
    expect(host.chamadas.setLayers).toBe(0);
  });
});
