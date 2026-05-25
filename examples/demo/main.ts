/**
 * Demo — cubo rotacionando via RotationSystem (ECS), câmera WASD.
 *
 * Usa: GameLoop, Renderer, Scene, World, InputManager.
 * Não requer API key — executa inteiramente no browser.
 *
 * Referências: ADR-0001 (Three.js), ADR-0002 (ECS)
 */

import * as THREE from 'three';
import type { Entity } from '../../src/ecs/Entity.js';
import { Component } from '../../src/ecs/Component.js';
import { System } from '../../src/ecs/System.js';
import { World } from '../../src/ecs/World.js';
import { GameLoop } from '../../src/core/GameLoop.js';
import { Renderer } from '../../src/core/Renderer.js';
import { Scene } from '../../src/core/Scene.js';
import { InputManager } from '../../src/core/InputManager.js';

// ─── Components ───────────────────────────────────────────────────────────────

/**
 * Associa uma THREE.Mesh a uma entidade ECS.
 * O RotationSystem usa este componente para acessar o objeto 3D.
 */
class MeshComponent extends Component {
  constructor(public readonly mesh: THREE.Mesh) {
    super();
  }
}

/**
 * Velocidades de rotação (radianos/segundo) por eixo.
 */
class RotationComponent extends Component {
  constructor(
    public speedX: number = 0,
    public speedY: number = 1,
    public speedZ: number = 0
  ) {
    super();
  }
}

// ─── Systems ──────────────────────────────────────────────────────────────────

/**
 * Rotaciona a mesh de cada entidade que possua MeshComponent + RotationComponent.
 * Implementa o padrão System do ECS (ADR-0002).
 */
class RotationSystem extends System {
  static override requiredComponents = [MeshComponent, RotationComponent];

  override update(entities: Entity[], deltaTime: number): void {
    // deltaTime chega em ms; converter para segundos para velocidade em rad/s
    const dt = deltaTime / 1000;
    for (const entity of entities) {
      const meshComp = entity.getComponent(MeshComponent)!;
      const rotComp = entity.getComponent(RotationComponent)!;
      meshComp.mesh.rotation.x += rotComp.speedX * dt;
      meshComp.mesh.rotation.y += rotComp.speedY * dt;
      meshComp.mesh.rotation.z += rotComp.speedZ * dt;
    }
  }
}

// ─── Renderer & Câmera ────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

const renderer = new Renderer({
  canvas,
  width: window.innerWidth,
  height: window.innerHeight,
});

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 5);

// Atualiza aspect ratio da câmera junto com o resize do renderer
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ─── Cena & Luzes ─────────────────────────────────────────────────────────────

const scene = new Scene();

// Luz ambiente: iluminação base suave em todos os ângulos
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// Luz direcional: simula sol, cria sombras e realces no cubo
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// ─── ECS ──────────────────────────────────────────────────────────────────────

const world = new World();
world.addSystem(new RotationSystem());

// Entidade cubo: BoxGeometry + MeshPhongMaterial (responde a luzes)
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshPhongMaterial({ color: 0x4488ff });
const cubeMesh = new THREE.Mesh(geometry, material);
scene.add(cubeMesh);

const cubeEntity = world.createEntity();
cubeEntity
  .addComponent(new MeshComponent(cubeMesh))
  .addComponent(new RotationComponent(0.5, 1.0, 0.3));

// ─── Input (WASD) ─────────────────────────────────────────────────────────────

const input = new InputManager();
// document.body captura eventos de teclado globalmente
input.attach(document.body);

const CAMERA_SPEED = 5; // unidades por segundo

// ─── Game Loop ────────────────────────────────────────────────────────────────

const loop = new GameLoop({
  onUpdate(deltaTime: number): void {
    const dt = deltaTime / 1000; // ms → s

    // Movimento da câmera por WASD (eixo Z = frente/trás, X = esquerda/direita)
    const move = new THREE.Vector3();
    if (input.isKeyDown('w') || input.isKeyDown('W')) move.z -= 1;
    if (input.isKeyDown('s') || input.isKeyDown('S')) move.z += 1;
    if (input.isKeyDown('a') || input.isKeyDown('A')) move.x -= 1;
    if (input.isKeyDown('d') || input.isKeyDown('D')) move.x += 1;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(CAMERA_SPEED * dt);
      camera.position.add(move);
    }

    // Avança o ECS — RotationSystem rotaciona o cubo
    world.tick(deltaTime);

    // Renderiza o frame
    renderer.render(scene.getThreeScene(), camera);
  },
});

loop.start();
