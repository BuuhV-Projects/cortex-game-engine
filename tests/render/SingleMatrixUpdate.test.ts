/**
 * SPEC-0680: uma travessia de matriz por render "de fora" de cada cena. O renderer falso reproduz a linha do
 * `Renderer.render` do three (`if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld()`) e, como o passe
 * principal com CSM, renderiza a mesma cena de novo por cascata, aninhado.
 */
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Raycaster, Scene, Vector3 } from 'three';
import { installSingleMatrixUpdate } from '../../src/render/SingleMatrixUpdate.js';

const CASCADES = 2;

/** Renderer com o comportamento do three: travessia por render e renders aninhados por cascata. */
class FakeRenderer {
  /** Posição de mundo do `probe` vista em cada render (principal e cascatas). */
  seen: Vector3[] = [];
  probe: Object3D | null = null;
  depth = 0;
  throwOnce = false;

  render(scene: Scene, camera: PerspectiveCamera): void {
    if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
    if (this.probe) this.seen.push(new Vector3().setFromMatrixPosition(this.probe.matrixWorld));
    if (this.throwOnce) {
      this.throwOnce = false;
      throw new Error('falha no render');
    }
    if (this.depth > 0) return;
    this.depth++;
    try {
      for (let i = 0; i < CASCADES; i++) this.render(scene, camera); // ShadowNode.renderShadow
    } finally {
      this.depth--;
    }
  }
}

function setup(bypass?: () => boolean) {
  const scene = new Scene();
  const group = new Object3D();
  const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  group.add(box);
  scene.add(group);
  const camera = new PerspectiveCamera();
  const renderer = new FakeRenderer();
  renderer.probe = box;
  const single = installSingleMatrixUpdate(renderer as never, bypass);
  const sceneUpdates = vi.spyOn(scene, 'updateMatrixWorld');
  const boxUpdates = vi.spyOn(box, 'updateMatrixWorld');
  return { scene, group, box, camera, renderer, single, sceneUpdates, boxUpdates };
}

describe('installSingleMatrixUpdate (SPEC-0680)', () => {
  it('a matriz da cena é atualizada exatamente uma vez por quadro, com as cascatas aninhadas', () => {
    const { scene, camera, renderer, single, sceneUpdates, boxUpdates } = setup();
    for (let frame = 0; frame < 3; frame++) renderer.render(scene, camera);
    expect(sceneUpdates).toHaveBeenCalledTimes(3);
    expect(boxUpdates).toHaveBeenCalledTimes(3); // a descida chega a cada nó uma vez por quadro
    expect(single.stats.updates).toBe(3);
    expect(renderer.seen).toHaveLength(3 * (1 + CASCADES));
  });

  it('sem o embrulho o three percorria a cena uma vez por passe (a linha de base)', () => {
    const { scene, camera, renderer, single, sceneUpdates } = setup();
    single.uninstall();
    renderer.render(scene, camera);
    expect(sceneUpdates).toHaveBeenCalledTimes(1 + CASCADES);
  });

  it('objeto movido entre quadros aparece na pose nova em todos os passes do quadro seguinte', () => {
    const { scene, group, camera, renderer } = setup();
    renderer.render(scene, camera);
    group.position.set(5, 0, 0);
    renderer.seen = [];
    renderer.render(scene, camera);
    expect(renderer.seen.map((v) => v.x)).toEqual([5, 5, 5]);
  });

  it('objeto movido entre dois renders de fora no mesmo quadro aparece certo no segundo', () => {
    const { scene, box, camera, renderer, sceneUpdates } = setup();
    renderer.render(scene, camera);
    box.position.set(0, 2, 0);
    renderer.seen = [];
    renderer.render(scene, camera); // split-screen / outra câmera
    expect(renderer.seen.every((v) => v.y === 2)).toBe(true);
    expect(sceneUpdates).toHaveBeenCalledTimes(2);
  });

  it('fora do render o auto-update volta e o picking acha o objeto na pose do quadro', () => {
    const { scene, group, camera, renderer } = setup();
    group.position.set(0, 0, -10);
    renderer.render(scene, camera);
    expect(scene.matrixWorldAutoUpdate).toBe(true);
    const ray = new Raycaster(new Vector3(0, 0, 0), new Vector3(0, 0, -1));
    expect(ray.intersectObject(scene, true)[0]?.distance).toBe(9.5); // face da caixa em z = -9,5
  });

  it('render que lança devolve o auto-update da cena', () => {
    const { scene, camera, renderer } = setup();
    renderer.throwOnce = true;
    expect(() => renderer.render(scene, camera)).toThrow('falha no render');
    expect(scene.matrixWorldAutoUpdate).toBe(true);
  });

  it('com o desvio ligado (espelho nativo) o render passa direto', () => {
    const { scene, camera, renderer, single, sceneUpdates } = setup(() => true);
    renderer.render(scene, camera);
    expect(sceneUpdates).toHaveBeenCalledTimes(1 + CASCADES);
    expect(single.stats.updates).toBe(0);
  });

  it('cena com auto-update já desligado (?matrixFreeze) não é percorrida nem religada', () => {
    const { scene, camera, renderer, sceneUpdates } = setup();
    scene.matrixWorldAutoUpdate = false;
    renderer.render(scene, camera);
    expect(sceneUpdates).not.toHaveBeenCalled();
    expect(scene.matrixWorldAutoUpdate).toBe(false);
  });

  it('cena sem updateMatrixWorld (mock) passa direto', () => {
    const render = vi.fn();
    const renderer = { render };
    installSingleMatrixUpdate(renderer as never);
    const fake = {};
    renderer.render(fake as never, {} as never);
    expect(render).toHaveBeenCalledWith(fake, {});
  });

  it('uninstall devolve o render do protótipo ou a propriedade própria', () => {
    const renderer = new FakeRenderer();
    const single = installSingleMatrixUpdate(renderer as never);
    expect(Object.prototype.hasOwnProperty.call(renderer, 'render')).toBe(true);
    single.uninstall();
    expect(Object.prototype.hasOwnProperty.call(renderer, 'render')).toBe(false);

    const own = vi.fn();
    const comPropria = { render: own };
    installSingleMatrixUpdate(comPropria as never).uninstall();
    expect(comPropria.render).toBe(own);
  });
});
