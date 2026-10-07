/** SPEC-0322: poda de subárvores fora do frustum na projeção do `three`. */
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
import { ProjectionPruner, MAX_CANDIDATE_RADIUS } from '../../src/render/ProjectionPruner.js';

/**
 * Imitação do `Renderer._projectObject` do `three` no que importa aqui: poda em
 * `visible === false`, testa cada malha contra o frustum da câmera e recursa
 * pelos filhos via `this._projectObject` (é a recursão que o embrulho troca).
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

/** Um "ônibus": grupo compacto de 3 malhas. */
function bus(name: string, x: number, z: number): Group {
  const g = new Group();
  g.name = name;
  g.position.set(x, 0, z);
  g.add(box(`${name}-a`, 0, 0), box(`${name}-b`, 1, 0), box(`${name}-c`, -1, 0));
  return g;
}

function render(r: FakeRenderer, scene: Scene, camera: Camera): void {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  r.visited = [];
  r.pushed = [];
  r._projectObject(scene, camera);
}

describe('ProjectionPruner (SPEC-0322)', () => {
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

  it('grupo inteiro fora do frustum é podado na raiz e volta visível depois', () => {
    const behind = bus('atras', 0, 50); // atrás da câmera
    const ahead = bus('frente', 0, -50);
    scene.add(behind, ahead);
    render(renderer, scene, camera);
    expect(renderer.visited).not.toContain(behind);
    expect(renderer.visited.filter((o) => o.name.startsWith('atras'))).toHaveLength(0);
    expect(renderer.pushed.map((o) => o.name)).toEqual(['frente-a', 'frente-b', 'frente-c']);
    expect(behind.visible).toBe(true); // a poda só vale durante a projeção
    expect(pruner.candidateCount).toBe(2);
  });

  it('filho visível de um grupo grande não é podado', () => {
    const spread = new Group();
    spread.name = 'lojas';
    const near = bus('loja-perto', 0, -20);
    const far = bus('loja-longe', 0, 4 * MAX_CANDIDATE_RADIUS); // atrás, longe
    spread.add(near, far);
    scene.add(spread);
    render(renderer, scene, camera);
    expect(renderer.visited).toContain(spread);
    expect(renderer.pushed.map((o) => o.name)).toEqual(['loja-perto-a', 'loja-perto-b', 'loja-perto-c']);
    expect(renderer.visited).not.toContain(far);
  });

  it('grupo que cruza a borda do frustum não é podado', () => {
    const g = bus('borda', 0, 0); // a câmera está dentro dele
    scene.add(g);
    render(renderer, scene, camera);
    expect(renderer.pushed.length).toBeGreaterThan(0);
  });

  it('caster fora da câmera continua na passada de sombra', () => {
    const caster = bus('caster', 0, 50); // fora da câmera do jogo
    scene.add(caster);
    const shadowCamera = new OrthographicCamera(-100, 100, 100, -100, 0.1, 500);
    shadowCamera.position.set(0, 200, 0);
    shadowCamera.lookAt(0, 0, 0);
    render(renderer, scene, camera);
    expect(renderer.visited).not.toContain(caster);
    // Mesmo quadro: o `three` renderiza a sombra pela câmera da luz.
    render(renderer, scene, shadowCamera);
    expect(renderer.pushed.map((o) => o.name)).toEqual(['caster-a', 'caster-b', 'caster-c']);
  });

  it('subárvore com luz ou frustumCulled=false nunca é podada', () => {
    const lit = bus('com-luz', 0, 50);
    lit.add(new PointLight());
    const always = bus('sempre', 0, 60);
    (always.children[0] as Mesh).frustumCulled = false;
    scene.add(lit, always);
    render(renderer, scene, camera);
    expect(renderer.visited).toContain(lit);
    expect(renderer.pushed.map((o) => o.name)).toEqual(['sempre-a']);
  });

  it('filho novo dentro de candidata remonta a esfera (sem sumir)', () => {
    const g = bus('cresce', 0, 50);
    scene.add(g);
    render(renderer, scene, camera);
    g.add(box('cresce-novo', 0, -100)); // bem na frente da câmera
    render(renderer, scene, camera);
    expect(renderer.pushed.map((o) => o.name)).toContain('cresce-novo');
  });

  it('subárvore sem nada na camada da câmera sai mesmo à frente dela', () => {
    const LOTE = 27; // peças de boneco desenhadas por um lote instanciado
    const figura = bus('figura', 0, -10);
    figura.traverse((o) => o.layers.set(LOTE));
    const comItem = bus('figura-com-item', 0, -12);
    comItem.traverse((o) => o.layers.set(LOTE));
    comItem.children[0].layers.set(0); // item na mão, desenhado pela câmera
    scene.add(figura, comItem);
    render(renderer, scene, camera);
    expect(renderer.visited).not.toContain(figura);
    expect(renderer.pushed.map((o) => o.name)).toEqual(['figura-com-item-a']);
    // A câmera passa a ver a camada do lote: remonta e para de podar.
    camera.layers.enable(LOTE);
    render(renderer, scene, camera);
    expect(renderer.pushed.map((o) => o.name)).toContain('figura-b');
  });

  it('câmera nula desliga a poda', () => {
    const behind = bus('atras', 0, 50);
    scene.add(behind);
    pruner.camera = null;
    render(renderer, scene, camera);
    expect(renderer.visited).toContain(behind);
  });

  it('detach devolve o método do protótipo', () => {
    pruner.detach();
    expect(Object.prototype.hasOwnProperty.call(renderer, '_projectObject')).toBe(false);
  });
});
