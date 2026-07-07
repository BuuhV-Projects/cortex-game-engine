/**
 * Testes de Scene (src/core/Scene.ts) — foco no disposeAll (troca de fase).
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Scene } from '../../src/core/Scene.js';

describe('Scene.disposeAll', () => {
  it('remove todos os filhos e libera geometria/material da GPU', () => {
    const scene = new Scene();
    const geo = new THREE.BoxGeometry();
    const mat = new THREE.MeshStandardMaterial();
    const geoSpy = vi.spyOn(geo, 'dispose');
    const matSpy = vi.spyOn(mat, 'dispose');
    scene.add(new THREE.Mesh(geo, mat));

    scene.disposeAll();

    expect(scene.getThreeScene().children).toHaveLength(0);
    expect(geoSpy).toHaveBeenCalledTimes(1);
    expect(matSpy).toHaveBeenCalledTimes(1);
  });

  it('libera texturas do material e limpa background/environment', () => {
    const scene = new Scene();
    const tex = new THREE.Texture();
    const texSpy = vi.spyOn(tex, 'dispose');
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), mat));
    scene.getThreeScene().background = new THREE.Color('#123456');

    scene.disposeAll();

    expect(texSpy).toHaveBeenCalledTimes(1);
    expect(scene.getThreeScene().background).toBeNull();
  });

  it('percorre a hierarquia (dispõe filhos aninhados)', () => {
    const scene = new Scene();
    const childGeo = new THREE.SphereGeometry();
    const geoSpy = vi.spyOn(childGeo, 'dispose');
    const group = new THREE.Group();
    group.add(new THREE.Mesh(childGeo, new THREE.MeshBasicMaterial()));
    scene.add(group);

    scene.disposeAll();

    expect(geoSpy).toHaveBeenCalledTimes(1);
    expect(scene.getThreeScene().children).toHaveLength(0);
  });

  // Overlays do editor sobrevivem à troca de fase (gizmo de eixos, helpers): sem
  // isto, voltar ao menu e entrar noutra fase apagava o gizmo de seleção.
  it('PRESERVA (não dispõe nem remove) os overlays do editor', () => {
    const scene = new Scene();

    const gizmoGeo = new THREE.BoxGeometry();
    const gizmoGeoSpy = vi.spyOn(gizmoGeo, 'dispose');
    const gizmo = new THREE.Mesh(gizmoGeo, new THREE.MeshBasicMaterial());
    gizmo.userData['editorInternal'] = true;

    const helperGeo = new THREE.BoxGeometry();
    const helperGeoSpy = vi.spyOn(helperGeo, 'dispose');
    const helper = new THREE.Mesh(helperGeo, new THREE.MeshBasicMaterial());
    helper.userData['cortexKeep'] = true;

    const sceneGeo = new THREE.BoxGeometry();
    const sceneGeoSpy = vi.spyOn(sceneGeo, 'dispose');
    const sceneObj = new THREE.Mesh(sceneGeo, new THREE.MeshBasicMaterial());

    scene.add(gizmo, helper, sceneObj);

    scene.disposeAll();

    // Objeto de cena: removido e disposto.
    expect(sceneGeoSpy).toHaveBeenCalledTimes(1);
    // Overlays do editor: continuam na cena e a GPU deles NÃO foi liberada.
    expect(gizmoGeoSpy).not.toHaveBeenCalled();
    expect(helperGeoSpy).not.toHaveBeenCalled();
    const remaining = scene.getThreeScene().children;
    expect(remaining).toContain(gizmo);
    expect(remaining).toContain(helper);
    expect(remaining).not.toContain(sceneObj);
  });
});
