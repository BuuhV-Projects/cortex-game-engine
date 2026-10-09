/** SPEC-0326: poda das subárvores sem nada desenhável pela câmera do jogo. */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BoxGeometry,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Scene,
} from 'three';
import type { Camera, Object3D } from 'three';
import { ProjectionPruner } from '../../src/render/ProjectionPruner.js';

/** Camada que nenhuma câmera desenha (peças de boneco do lote instanciado). */
const BATCH_LAYER = 27;

/**
 * Imitação do `Renderer._projectObject` do `three` no que importa aqui: poda em
 * `visible === false`, `layers.test`, frustum por malha e recursão pelos filhos
 * via `this._projectObject` (é a recursão que o embrulho troca).
 */
class FakeRendererBase {
  visited: Object3D[] = [];
  pushed: Object3D[] = [];
  private readonly _frustum = new Frustum();
  _projectObject(object: Object3D, camera: Camera): void {
    if (object.visible === false) return;
    if ((object as Scene).isScene) {
      this._frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
    this.visited.push(object);
    const mesh = object as Mesh;
    const inLayer = object.layers.test(camera.layers);
    if (inLayer && mesh.isMesh && (!mesh.frustumCulled || this._frustum.intersectsObject(mesh))) this.pushed.push(object);
    for (const child of object.children) this._projectObject(child, camera);
  }
}
class FakeRenderer extends FakeRendererBase {}

function box(name: string, x: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  m.name = name;
  m.position.set(x, 0, z);
  return m;
}

/** Grupo de 3 malhas. */
function trio(name: string, x: number, z: number): Group {
  const g = new Group();
  g.name = name;
  g.position.set(x, 0, z);
  g.add(box(`${name}-a`, 0, 0), box(`${name}-b`, 1, 0), box(`${name}-c`, -1, 0));
  return g;
}

/** Boneco do lote: hierarquia inteira na camada que a câmera não vê. */
function figure(name: string, x: number, z: number): Group {
  const g = trio(name, x, z);
  g.traverse((o) => o.layers.set(BATCH_LAYER));
  return g;
}

function render(r: FakeRenderer, scene: Scene, camera: Camera): void {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  r.visited = [];
  r.pushed = [];
  r._projectObject(scene, camera);
}

const names = (list: Object3D[]): string[] => list.map((o) => o.name);

describe('ProjectionPruner (SPEC-0326)', () => {
  let scene: Scene;
  let camera: PerspectiveCamera;
  let renderer: FakeRenderer;
  let pruner: ProjectionPruner;

  beforeEach(() => {
    scene = new Scene();
    // Câmera na origem olhando para -Z.
    camera = new PerspectiveCamera(60, 1, 0.1, 500);
    renderer = new FakeRenderer();
    pruner = new ProjectionPruner();
    pruner.attach(renderer);
    pruner.camera = camera;
  });

  it('subárvore sem desenhável na câmera é podada na raiz, mesmo à frente, e volta visível', () => {
    const fig = figure('boneco', 0, -10);
    scene.add(fig, trio('carro', 0, -20));
    render(renderer, scene, camera);
    expect(renderer.visited).not.toContain(fig);
    expect(names(renderer.pushed)).toEqual(['carro-a', 'carro-b', 'carro-c']);
    expect(fig.visible).toBe(true); // a poda só vale durante a projeção
    expect(pruner.candidateCount).toBe(1);
  });

  it('a RenderList sai idêntica à do three sem poda', () => {
    const crowd = new Group();
    for (let i = 0; i < 6; i++) crowd.add(figure(`b${i}`, i * 3 - 9, -15));
    const held = figure('com-item', 0, -12);
    held.children[0].layers.set(0); // item na mão, desenhado pela câmera
    crowd.add(held, trio('fora', 0, 40), trio('dentro', 2, -30));
    scene.add(crowd);
    pruner.camera = null;
    render(renderer, scene, camera);
    const expected = names(renderer.pushed);
    const visitsWithout = renderer.visited.length;
    pruner.camera = camera;
    render(renderer, scene, camera);
    expect(names(renderer.pushed)).toEqual(expected);
    expect(renderer.visited.length).toBeLessThan(visitsWithout);
  });

  it('filho desenhável de um grupo grande não é podado; os irmãos sem desenho são', () => {
    const big = new Group();
    const seen = trio('visivel', 0, -20);
    const fig = figure('boneco', 5, -20);
    big.add(seen, fig);
    scene.add(big);
    render(renderer, scene, camera);
    expect(renderer.visited).toContain(big);
    expect(names(renderer.pushed)).toEqual(['visivel-a', 'visivel-b', 'visivel-c']);
    expect(renderer.visited).not.toContain(fig);
  });

  it('caster fora da câmera continua na passada de sombra', () => {
    const caster = trio('caster', 0, 50); // atrás da câmera do jogo
    scene.add(caster, figure('boneco', 0, 45));
    const shadowCamera = new OrthographicCamera(-100, 100, 100, -100, 0.1, 500);
    shadowCamera.position.set(0, 200, 0);
    shadowCamera.lookAt(0, 0, 0);
    render(renderer, scene, camera);
    expect(renderer.pushed).toHaveLength(0);
    // Mesmo quadro: o `three` renderiza a sombra pela câmera da luz.
    render(renderer, scene, shadowCamera);
    expect(names(renderer.pushed)).toEqual(['caster-a', 'caster-b', 'caster-c']);
    expect(renderer.visited.some((o) => o.name.startsWith('boneco'))).toBe(true);
  });

  it('subárvore com luz nunca é podada', () => {
    const lit = figure('com-luz', 0, -10);
    lit.add(new PointLight());
    scene.add(lit);
    render(renderer, scene, camera);
    expect(renderer.visited).toContain(lit);
  });

  it('filho desenhável novo dentro de candidata remonta (não some)', () => {
    const fig = figure('boneco', 0, -10);
    scene.add(fig);
    render(renderer, scene, camera);
    fig.add(box('item-novo', 0, 0));
    render(renderer, scene, camera);
    expect(names(renderer.pushed)).toContain('item-novo');
  });

  it('câmera que passa a ver a camada do lote remonta e para de podar', () => {
    scene.add(figure('boneco', 0, -10));
    render(renderer, scene, camera);
    camera.layers.enable(BATCH_LAYER);
    render(renderer, scene, camera);
    expect(names(renderer.pushed)).toEqual(['boneco-a', 'boneco-b', 'boneco-c']);
  });

  it('subárvore escondida na montagem que reaparece é desenhada', () => {
    const g = trio('reaparece', 0, -20);
    g.visible = false;
    scene.add(g);
    render(renderer, scene, camera);
    g.visible = true;
    render(renderer, scene, camera);
    expect(names(renderer.pushed)).toEqual(['reaparece-a', 'reaparece-b', 'reaparece-c']);
  });

  it('câmera nula desliga a poda', () => {
    const fig = figure('boneco', 0, -10);
    scene.add(fig);
    pruner.camera = null;
    render(renderer, scene, camera);
    expect(renderer.visited).toContain(fig);
  });

  it('detach devolve o método do protótipo', () => {
    pruner.detach();
    expect(Object.prototype.hasOwnProperty.call(renderer, '_projectObject')).toBe(false);
  });
});
