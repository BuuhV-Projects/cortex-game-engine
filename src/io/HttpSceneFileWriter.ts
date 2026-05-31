import type { SceneFileV1 } from '../scene/SceneFile.js';
import type { SceneFileWriter } from './SceneFileWriter.js';

/**
 * Escreve o `SceneFileV1` via POST para um endpoint do dev server (Vite), que
 * grava o arquivo em disco. Pareia com `createSceneSavePlugin`
 * (cortex-game-engine/vite — plugin Node-only). Só funciona em `vite dev`.
 */
export class HttpSceneFileWriter implements SceneFileWriter {
  constructor(private readonly url = '/__save-scene-data') {}

  async save(file: SceneFileV1): Promise<void> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file, null, 2),
    });
    if (!res.ok) {
      throw new Error(`Falha ao salvar a cena (${res.status})`);
    }
  }
}
