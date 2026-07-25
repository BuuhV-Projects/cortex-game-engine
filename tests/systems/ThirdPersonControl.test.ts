/**
 * Testes do ThirdPersonControlSystem (src/systems/ThirdPersonControlSystem.ts),
 * foco no controle **gamepad-first** (Xbox): stick esquerdo anda (analógico), RT
 * corre, A pula. Ambiente node (sem `document`) → o caminho mouse/pointer-lock fica
 * inerte; exercitamos só o gamepad. Câmera real (three), sem WebGL.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { World } from '../../src/ecs/World.js';
import { TransformComponent } from '../../src/components/TransformComponent.js';
import { CharacterBodyComponent } from '../../src/components/CharacterBodyComponent.js';
import { Object3DComponent } from '../../src/components/Object3DComponent.js';
import { ThirdPersonControlSystem } from '../../src/systems/ThirdPersonControlSystem.js';

/** Stub de gamepad: eixos/botões fixos (sem deadzone — valores crus). */
function fakePad(axes: number[] = [], buttons: number[] = []) {
  return {
    getAxis: (_i: number, a: number) => axes[a] ?? 0,
    isButtonDown: (_i: number, b: number) => buttons[b] === 1,
  };
}
const noKeys = { isKeyDown: () => false, getMouseDelta: () => ({ x: 0, y: 0 }) };

function setup(pad: unknown, opts = {}) {
  const world = new World();
  const camera = new THREE.PerspectiveCamera();
  const sys = new ThirdPersonControlSystem(
    camera,
    noKeys as never,
    {} as HTMLElement,
    { moveSpeed: 2, sprintSpeed: 6, ...opts },
    pad as never,
  );
  world.addSystem(sys);
  const e = world.createEntity();
  e.addComponent(new TransformComponent(0, 0, 0, 0));
  e.addComponent(new CharacterBodyComponent());
  return { world, e };
}

describe('ThirdPersonControlSystem (gamepad-first)', () => {
  it('stick esquerdo pra frente (ly=-1) move o player pra -Z (yaw=0)', () => {
    const { world, e } = setup(fakePad([0, -1]));
    world.tick(16);
    const t = e.getComponent(TransformComponent)!;
    expect(t.z).toBeLessThan(0);
    expect(Math.abs(t.x)).toBeLessThan(1e-6); // sem deriva lateral
  });

  it('stick lateral (lx=1) move pra +X', () => {
    const { world, e } = setup(fakePad([1, 0]));
    world.tick(16);
    expect(e.getComponent(TransformComponent)!.x).toBeGreaterThan(0);
  });

  it('analógico: stick parcial (0.5) anda ~metade do stick cheio', () => {
    const full = setup(fakePad([0, -1]));
    const half = setup(fakePad([0, -0.5]));
    full.world.tick(16);
    half.world.tick(16);
    const dz = (s: ReturnType<typeof setup>) => Math.abs(s.e.getComponent(TransformComponent)!.z);
    expect(dz(half)).toBeGreaterThan(0);
    expect(dz(half)).toBeLessThan(dz(full));
    expect(dz(half) / dz(full)).toBeCloseTo(0.5, 1);
  });

  it('RT (botão 7) corre — anda mais que sem RT', () => {
    const walk = setup(fakePad([0, -1]));
    const run = setup(fakePad([0, -1], [0, 0, 0, 0, 0, 0, 0, 1]));
    walk.world.tick(16);
    run.world.tick(16);
    const dz = (s: ReturnType<typeof setup>) => Math.abs(s.e.getComponent(TransformComponent)!.z);
    expect(dz(run)).toBeGreaterThan(dz(walk));
  });

  it('A (botão 0) enfileira o pulo (borda de pressão, uma vez)', () => {
    const { world, e } = setup(fakePad([0, 0], [1]));
    const body = e.getComponent(CharacterBodyComponent)!;
    world.tick(16);
    expect(body.jumpQueued).toBe(true);
  });

  it('despausar com A ainda segurado NÃO pula (SPEC-0156 — pulo fantasma do menu)', () => {
    // A segurado navegando o menu de pausa; ao despausar, a borda não pode contar.
    const buttons = [1];
    let paused = true;
    const { world, e } = setup(fakePad([0, 0], buttons), { pauseWhen: () => paused });
    const body = e.getComponent(CharacterBodyComponent)!;
    world.tick(16); // pausado (A segurado no menu)
    paused = false;
    world.tick(16); // 1º frame livre — A ainda segurado
    expect(body.jumpQueued).toBe(false);
    buttons[0] = 0;
    world.tick(16); // soltou
    buttons[0] = 1;
    world.tick(16); // apertou de novo → borda real
    expect(body.jumpQueued).toBe(true);
  });

  it('sem gamepad nem teclado: player não se move', () => {
    const { world, e } = setup(undefined);
    world.tick(16);
    const t = e.getComponent(TransformComponent)!;
    expect(t.x).toBe(0);
    expect(t.z).toBe(0);
  });
});

describe('ThirdPersonControlSystem — colisão de câmera (spring arm)', () => {
  function setupCam(scene: THREE.Object3D) {
    const world = new World();
    const camera = new THREE.PerspectiveCamera();
    const sys = new ThirdPersonControlSystem(
      camera,
      noKeys as never,
      {} as HTMLElement,
      { cameraDistance: 5.5, cameraHeight: 1.5 },
      undefined,
      scene,
    );
    world.addSystem(sys);
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0, 0));
    e.addComponent(new CharacterBodyComponent());
    scene.updateMatrixWorld(true); // sem render no teste; o raycast usa matrixWorld
    return { world, camera };
  }
  const target = new THREE.Vector3(0, 1.5, 0); // alvo = player + cameraHeight

  it('puxa a câmera pra dentro quando há obstáculo entre o alvo e a câmera', () => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.5));
    wall.position.set(0, 0, 2); // entre o alvo (z=0) e a câmera (atrás, +Z)
    scene.add(wall);
    const { world, camera } = setupCam(scene);
    world.tick(16);
    const dist = camera.position.distanceTo(target);
    expect(dist).toBeLessThan(5.5); // não foi até a distância cheia
    expect(dist).toBeGreaterThanOrEqual(0.8); // respeita a distância mínima
  });

  it('sem obstáculo: câmera fica na distância cheia', () => {
    const { world, camera } = setupCam(new THREE.Scene());
    world.tick(16);
    expect(camera.position.distanceTo(target)).toBeCloseTo(5.5, 1);
  });

  it('ignora o gizmo do editor (TransformControls detached na origem = spawn)', () => {
    // Cenário real: fora do F2 o helper do TransformControls segue na cena,
    // DETACHED na origem (o spawn do player) e com ~120 meshes raycastáveis
    // (o raycast do three não pula invisível). A exclusão é a marca
    // `editorInternal` na raiz do helper (como o ObjectEditSystem marca).
    const mkScene = (marked: boolean) => {
      const scene = new THREE.Scene();
      const gizmoCam = new THREE.PerspectiveCamera();
      gizmoCam.position.set(4, 3, 4); // pose plausível de câmera de editor
      const controls = new TransformControls(gizmoCam);
      const helper = (controls as unknown as { getHelper(): THREE.Object3D }).getHelper();
      if (marked) helper.userData['editorInternal'] = true;
      helper.visible = false;
      scene.add(helper);
      return scene;
    };

    // Caso-controle: SEM a marca, o gizmo intersecta o raio e puxa a câmera —
    // prova que o cenário exercita a exclusão de verdade (não passa vazio).
    const un = setupCam(mkScene(false));
    un.world.tick(16);
    expect(un.camera.position.distanceTo(target)).toBeLessThan(5.4);

    // Com a marca (como o editor cria), o spring arm devolve a distância cheia.
    const ok = setupCam(mkScene(true));
    ok.world.tick(16);
    expect(ok.camera.position.distanceTo(target)).toBeCloseTo(5.5, 1);
  });
});

describe('ThirdPersonControlSystem — transições run_stop / run_jump', () => {
  function mockAnimator() {
    const played: string[] = [];
    return {
      clipNames: () => ['idle', 'walk', 'run', 'jump', 'fall', 'run_stop', 'run_jump', 'punch'],
      play: (n: string) => { played.push(n); },
      played,
    };
  }
  function mutPad() {
    const p = { ax: [0, 0] as number[], bt: [] as number[] };
    return {
      pad: { getAxis: (_i: number, a: number) => p.ax[a] ?? 0, isButtonDown: (_i: number, b: number) => p.bt[b] === 1 },
      set: (ax: number[], bt: number[] = []) => { p.ax = ax; p.bt = bt; },
    };
  }
  function setupAnim(animator: unknown, pad: unknown) {
    const world = new World();
    const sys = new ThirdPersonControlSystem(
      new THREE.PerspectiveCamera(), noKeys as never, {} as HTMLElement,
      { sprintSpeed: 6, runThreshold: 3.5 }, pad as never,
    );
    world.addSystem(sys);
    const e = world.createEntity();
    e.addComponent(new TransformComponent(0, 0, 0, 0));
    const body = new CharacterBodyComponent();
    e.addComponent(body);
    const obj = new THREE.Object3D();
    (obj.userData as Record<string, unknown>)['cortexAnim'] = animator;
    e.addComponent(new Object3DComponent(obj));
    return { world, body, sys };
  }

  it('correndo + pular toca run_jump (em vez de jump)', () => {
    const anim = mockAnimator();
    const mp = mutPad();
    const { world, body } = setupAnim(anim, mp.pad);
    mp.set([0, -1], [0, 0, 0, 0, 0, 0, 0, 1]); // stick cheio pra frente + RT (corre)
    body.grounded = true;
    world.tick(16);
    expect(anim.played).toContain('run');
    body.grounded = false; // pulo: no ar, subindo
    body.velocityY = 5;
    world.tick(16);
    expect(anim.played).toContain('run_jump');
    expect(anim.played).not.toContain('jump');
  });

  it('playAction toca um clipe one-shot (punch) e volta à locomoção depois', () => {
    const anim = mockAnimator();
    const mp = mutPad();
    const { world, body, sys } = setupAnim(anim, mp.pad);
    body.grounded = true; // parado no chão
    sys.playAction('punch', 0.3);
    world.tick(16);
    expect(anim.played).toContain('punch');
    for (let i = 0; i < 25; i++) world.tick(16); // > 0.3s → ação acaba
    expect(anim.played.at(-1)).toBe('idle');
  });

  it('correndo e parar toca run_stop', () => {
    const anim = mockAnimator();
    const mp = mutPad();
    const { world, body } = setupAnim(anim, mp.pad);
    mp.set([0, -1], [0, 0, 0, 0, 0, 0, 0, 1]); // corre
    body.grounded = true;
    world.tick(16);
    mp.set([0, 0], []); // solta tudo (para)
    body.grounded = true; body.velocityY = 0;
    world.tick(16);
    expect(anim.played).toContain('run_stop');
  });
});
