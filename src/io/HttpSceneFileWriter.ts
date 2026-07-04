import type { SceneFileV1 } from '../scene/SceneFile.js';
import type { SceneFileWriter } from './SceneFileWriter.js';

/**
 * Escreve o `SceneFileV1` via POST para um endpoint do dev server (Vite), que
 * grava o arquivo em disco. Pareia com `createSceneSavePlugin`
 * (cortex-game-engine/vite — plugin Node-only). Só funciona em `vite dev`.
 *
 * `path` (opcional) escolhe o arquivo de destino, relativo à raiz do projeto
 * (ex.: `assets/scene-data-fase2.json` — overlay por fase). Sem `path`, o
 * plugin grava no `target` configurado nele (default `assets/scene-data.json`).
 */
export class HttpSceneFileWriter implements SceneFileWriter {
  constructor(
    private readonly url = '/__save-scene-data',
    private readonly path?: string,
  ) {}

  async save(file: SceneFileV1): Promise<void> {
    const target = this.path ? `${this.url}?path=${encodeURIComponent(this.path)}` : this.url;
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(file, null, 2),
    });
    if (!res.ok) {
      throw new Error(`Falha ao salvar a cena (${res.status})`);
    }
  }
}
