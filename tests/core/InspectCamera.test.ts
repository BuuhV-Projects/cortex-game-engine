/**
 * Testes da câmera de inspeção (src/core/InspectCamera.ts — SPEC-0131): pose/órbita
 * corretas, auto-enquadramento pelo bbox da cena, e o filtro que ignora helpers do
 * editor (outra layer) e backdrops gigantes (skybox) no enquadramento automático.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { InspectCamera } from '../../src/core/InspectCamera.js';

/** Cria um mesh cúbico de lado `size` centrado em `center`, opcionalmente noutra layer. */
function cube(size: number, center: [number, number, number], layer?: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  m.position.set(center[0], center[1], center[2]);
  if (layer !== undefined) m.layers.set(layer);
  m.updateMatrixWorld(true);
  return m;
}

describe('InspectCamera', () => {
  it('começa inativa e é ativada por pose/orbit/frame', () => {
    const cam = new InspectCamera();
    expect(cam.active).toBe(false);
    cam.pose([1, 2, 3]);
    expect(cam.active).toBe(true);
    cam.clear();
    expect(cam.active).toBe(false);
  });

  it('pose() posiciona e olha pro alvo (default origem)', () => {
    const cam = new InspectCamera();
    cam.pose([0, 0, 10], [0, 0, 0]);
    expect(cam.camera.position.toArray()).toEqual([0, 0, 10]);
    // Olhando pra origem por -Z: a direção de visão aponta pra -Z.
    const dir = new THREE.Vector3();
    cam.camera.getWorldDirection(dir);
    expect(dir.z).toBeCloseTo(-1, 5);
  });

  it('orbit() com pitch negativo põe a câmera ACIMA do alvo (mergulho)', () => {
    const cam = new InspectCamera();
    const scene = new THREE.Scene();
    scene.add(cube(2, [0, 0, 0]));
    cam.orbit(scene, { yaw: 0, pitch: -30, dist: 20, target: [0, 0, 0] });
    expect(cam.camera.position.y).toBeGreaterThan(0); // acima do alvo
    expect(cam.camera.position.distanceTo(new THREE.Vector3(0, 0, 0))).toBeCloseTo(20, 4);
  });

  it('orbit() sem dist auto-enquadra: objeto maior ⇒ câmera mais longe', () => {
    const near = new InspectCamera();
    const far = new InspectCamera();
    const small = new THREE.Scene();
    small.add(cube(2, [0, 0, 0]));
    const big = new THREE.Scene();
    big.add(cube(20, [0, 0, 0]));
    near.orbit(small, { yaw: 0, pitch: 0, target: [0, 0, 0] });
    far.orbit(big, { yaw: 0, pitch: 0, target: [0, 0, 0] });
    const dNear = near.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    const dFar = far.camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    expect(dFar).toBeGreaterThan(dNear);
  });

  it('frame() centra no bbox da cena (alvo = centro dos objetos)', () => {
    const cam = new InspectCamera();
    const scene = new THREE.Scene();
    scene.add(cube(2, [10, 0, 0])); // centro em x=10
    cam.frame(scene);
    const dir = new THREE.Vector3();
    cam.camera.getWorldDirection(dir);
    // A câmera aponta pro centro (x≈10): posição + direção*dist cai perto de x=10.
    const hit = cam.camera.position.clone().addScaledVector(dir, cam.camera.position.length());
    expect(hit.x).toBeGreaterThan(5);
  });

  it('ignora helpers do editor (outra layer) no auto-enquadramento', () => {
    const withHelper = new InspectCamera();
    const plain = new InspectCamera();
    const sceneA = new THREE.Scene();
    sceneA.add(cube(2, [0, 0, 0]));
    sceneA.add(cube(100, [500, 0, 0], 30)); // "helper" enorme longe, na layer 30
    const sceneB = new THREE.Scene();
    sceneB.add(cube(2, [0, 0, 0]));
    withHelper.frame(sceneA);
    plain.frame(sceneB);
    // O helper na layer 30 não deve inflar/deslocar o enquadramento.
    expect(withHelper.camera.position.distanceTo(plain.camera.position)).toBeLessThan(1e-3);
  });

  it('ignora backdrops gigantes (skybox > 1000u) no auto-enquadramento', () => {
    const withSky = new InspectCamera();
    const plain = new InspectCamera();
    const sceneA = new THREE.Scene();
    sceneA.add(cube(2, [0, 0, 0]));
    sceneA.add(cube(4000, [0, 0, 0])); // skybox gigante na layer 0
    const sceneB = new THREE.Scene();
    sceneB.add(cube(2, [0, 0, 0]));
    withSky.frame(sceneA);
    plain.frame(sceneB);
    expect(withSky.camera.position.distanceTo(plain.camera.position)).toBeLessThan(1e-3);
  });

  it('setAspect() atualiza o aspect da câmera', () => {
    const cam = new InspectCamera();
    cam.setAspect(1600, 900);
    expect(cam.camera.aspect).toBeCloseTo(1600 / 900, 6);
    cam.setAspect(0, 0); // inválido: não muda
    expect(cam.camera.aspect).toBeCloseTo(1600 / 900, 6);
  });
});
