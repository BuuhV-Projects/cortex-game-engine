import * as THREE from 'three';
import { parseSceneFile, type SceneFileV1 } from './SceneFile.js';

/**
 * Carrega e aplica arquivos de cena (`SceneFileV1`). Leitura é leve (fetch +
 * parse validado); aplicação percorre o grafo por `Object3D.name`.
 */
export class SceneLoader {
  /**
   * Faz fetch + parse de um `scene-data.json`. Retorna `null` se o arquivo não
   * existir (404) ou for inválido — o chamador deve cair pros defaults do código.
   */
  async loadSceneFile(url: string): Promise<SceneFileV1 | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw: unknown = await res.json();
      return parseSceneFile(raw);
    } catch {
      return null;
    }
  }

  /**
   * Aplica as transforms salvas aos objetos de `root` cujo `name` bate com uma
   * chave em `file.objects`. Retorna quantos objetos foram afetados.
   */
  applyToRoot(root: THREE.Object3D, file: SceneFileV1): { applied: number } {
    let applied = 0;
    root.traverse((obj) => {
      const e = file.objects[obj.name];
      if (!e) return;
      obj.position.set(e.position[0], e.position[1], e.position[2]);
      obj.rotation.set(e.rotation[0], e.rotation[1], e.rotation[2]);
      obj.scale.set(e.scale[0], e.scale[1], e.scale[2]);
      applied += 1;
    });
    return { applied };
  }
}
