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
   * Remove TODOS os filhos E libera os recursos de GPU deles (geometrias,
   * materiais e texturas). Diferente de {@link clear} (que só desanexa e deixa
   * a GPU vazar): use ao **trocar de cena/fase** pra não acumular memória de
   * vídeo. Também limpa `background`/`environment`.
   *
   * **Exceção:** PRESERVA (não remove nem dispõe) os overlays do editor — filhos
   * marcados `userData.editorInternal` (gizmo de seleção/eixos, contornos de
   * collider, anel de pincel) ou `userData.cortexKeep` (helpers de luz/câmera, a
   * câmera livre). São chrome de edição que sobrevive à troca de fase junto dos
   * sistemas `keepOnClear`; dispô-los deixava os eixos sumirem ao voltar ao menu
   * e entrar noutra fase. Ver attachEditor / World.clear. Em produção não há
   * editor (esses objetos não existem), então dispõe tudo normalmente.
   */
  disposeAll(): this {
    const seenTex = new Set<THREE.Texture>();
    const disposeMaterial = (m: THREE.Material): void => {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture && !seenTex.has(value)) {
          seenTex.add(value);
          value.dispose();
        }
      }
      m.dispose();
    };
    for (const child of [...this._scene.children]) {
      const ud = child.userData as Record<string, unknown>;
      if (ud['editorInternal'] === true || ud['cortexKeep'] === true) continue; // overlay do editor: sobrevive
      child.traverse((obj) => {
        const mesh = obj as Partial<THREE.Mesh>;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach(disposeMaterial);
        else if (mat) disposeMaterial(mat);
      });
      this._scene.remove(child);
    }
    const asAny = this._scene as unknown as { background?: unknown; environment?: THREE.Texture | null };
    if (asAny.environment) asAny.environment.dispose();
    asAny.background = null;
    asAny.environment = null;
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
