/**
 * Scene — encapsula THREE.Scene expondo uma API de gerenciamento de objetos.
 *
 * Esta classe é uma camada fina sobre Three.js: não tem dependência do ECS
 * nem de nenhum outro subsistema do motor. O propósito é manter a integração
 * com Three.js confinada a `src/core/` (ADR-0001) e oferecer uma superfície
 * de teste desacoplada.
 *
 * Referência: ADR-0001 (Renderizador baseado em Three.js)
 */

import * as THREE from 'three';

// ─── Classe Scene ──────────────────────────────────────────────────────────────

export class Scene {
  private readonly _scene: THREE.Scene;

  constructor() {
    this._scene = new THREE.Scene();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Adiciona um ou mais objetos Three.js à cena.
   * Equivale a `THREE.Scene.add()`; o objeto passado deve ser uma instância
   * de `THREE.Object3D` (Mesh, Light, Group, etc.).
   */
  add(...objects: THREE.Object3D[]): this {
    this._scene.add(...objects);
    return this;
  }

  /**
   * Remove um ou mais objetos Three.js da cena.
   * Equivale a `THREE.Scene.remove()`.
   */
  remove(...objects: THREE.Object3D[]): this {
    this._scene.remove(...objects);
    return this;
  }

  /**
   * Remove todos os objetos filhos da cena de uma vez.
   * Equivale a `THREE.Scene.clear()`.
   */
  clear(): this {
    this._scene.clear();
    return this;
  }

  /**
   * Retorna a instância interna do `THREE.Scene`.
   * Necessário para passar ao `Renderer.render(scene, camera)`.
   * Prefira sempre os métodos desta classe para manipular a cena.
   */
  getThreeScene(): THREE.Scene {
    return this._scene;
  }
}
