import { afterEach, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, PerspectiveCamera, Raycaster, Scene, SkinnedMesh, SphereGeometry, Vector3 } from 'three';
import { World } from '../../src/ecs/World.js';
import { EditableTargetComponent } from '../../src/components/EditableTargetComponent.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { EditorCameraSystem } from '../../src/editor/EditorCameraSystem.js';
import { createEditorState } from '../../src/editor/EditorState.js';

function setup() {
  const world = new World();
  const target = world.createEntity();
  target.addComponent(new TransformComponent());
  target.addComponent(new EditableTargetComponent());
  const state = createEditorState();
  state.active = true;
  const camera = new PerspectiveCamera();
  const gameCamera = new PerspectiveCamera();
  gameCamera.position.set(0, 0, 5);
  const scene = new Scene();
  const keys = new Set<string>();
  const input = {
    isKeyDown: (key: string) => keys.has(key),
    isButtonDown: () => false,
    getMouseDelta: () => ({ x: 0, y: 0 }),
  };
  const hud = { setVisible() {}, showToast() {}, coords: { textContent: '' } };
  const system = new EditorCameraSystem(state, camera, gameCamera, input as never, scene, hud as never);
  world.addSystem(system);
  return { world, target, state, camera, gameCamera, scene, keys, input, system };
}

afterEach(() => vi.restoreAllMocks());

describe('EditorCameraSystem', () => {
  it('não raycasta parado ou ao girar a câmera sem translação', () => {
    const { world, camera, scene, input } = setup();
    scene.add(new Mesh(new SphereGeometry(1, 64, 64)));
    const raycast = vi.spyOn(Mesh.prototype, 'raycast');
    world.tick(16);
    expect(raycast).not.toHaveBeenCalled();
    const before = camera.quaternion.clone();
    input.isButtonDown = () => true;
    input.getMouseDelta = () => ({ x: 10, y: 5 });
    world.tick(16);
    expect(camera.quaternion.equals(before)).toBe(false);
    expect(camera.position.toArray()).toEqual([0, 0, 5]);
    expect(raycast).not.toHaveBeenCalled();
  });

  it('acelera a malha densa e mantém a velocidade calculada pela superfície', () => {
    const { world, camera, scene, keys } = setup();
    const rock = new Mesh(new SphereGeometry(1, 64, 64));
    scene.add(rock);
    scene.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    const distance = ray.intersectObject(rock)[0]!.distance;
    keys.add('w');
    world.tick(16);
    expect(rock.geometry.boundsTree).toBeDefined();
    expect(camera.position.z).toBeCloseTo(5 - 12 * .016 * distance / 18);
    const tree = rock.geometry.boundsTree;
    world.tick(16);
    expect(rock.geometry.boundsTree).toBe(tree);

    // Novos objetos entram nas consultas; helpers, ocultos e skinning ficam fora.
    const hidden = new Group();
    hidden.visible = false;
    const helper = new Group();
    helper.userData['editorInternal'] = true;
    const excluded = [new Mesh(), new Mesh(), new SkinnedMesh()];
    hidden.add(excluded[0]!);
    helper.add(excluded[1]!);
    scene.add(hidden, helper, excluded[2]!);
    const calls = excluded.map(obj => vi.spyOn(obj, 'raycast'));
    const added = new Mesh(new SphereGeometry(1, 32, 32));
    scene.add(added);
    world.tick(16);
    expect(added.geometry.boundsTree).toBeDefined();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it('teleporta para a superfície mesmo sem teclas de movimento', () => {
    const { world, scene, keys, target, gameCamera } = setup();
    scene.add(new Mesh(new SphereGeometry(1, 32, 32)));
    scene.updateMatrixWorld(true);
    gameCamera.position.set(0, 5, 0);
    keys.add('t');
    world.tick(16);
    expect(target.getComponent(TransformComponent)!.y).toBeCloseTo(1.5);
  });

  it('copia a pose final após a pausa de carregamento e preserva a navegação', () => {
    const { world, system, camera, gameCamera, state, keys } = setup();
    let loading = true;
    system.pauseWhen = () => loading;
    world.tick(16);
    // A câmera da largada chega depois de vários frames de carga.
    gameCamera.position.set(-14, 16, 67);
    gameCamera.lookAt(-14, 13, 60);
    loading = false;
    world.tick(16);
    expect(camera.position.toArray()).toEqual(gameCamera.position.toArray());
    expect(camera.quaternion.angleTo(gameCamera.quaternion)).toBeLessThan(1e-6);
    keys.add('d');
    world.tick(16);
    keys.clear();
    const moved = camera.position.clone();
    world.tick(16);
    expect(camera.position.toArray()).toEqual(moved.toArray());
    expect(camera.position.equals(gameCamera.position)).toBe(false);
    state.active = false;
    world.tick(16);
    state.active = true;
    world.tick(16);
    expect(camera.position.toArray()).toEqual(gameCamera.position.toArray());
  });
});
