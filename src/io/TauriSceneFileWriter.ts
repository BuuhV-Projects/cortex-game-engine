import type { SceneFileV1 } from '../scene/SceneFile.js';
import type { SceneFileWriter } from './SceneFileWriter.js';

/**
 * Escreve o `SceneFileV1` no app empacotado via Tauri, usando o plugin de FS
 * (`@tauri-apps/plugin-fs`, Tauri v2). Importado **dinamicamente** com um
 * especificador não-literal, pra que o engine NÃO tenha dependência fixa de
 * Tauri (jogos web puros não pagam por isso, e o tsc não tenta resolver).
 *
 * Útil só em builds que permitem edição (ex.: `tauri:build:debug`). Cabe ao
 * projeto decidir o `path` e se o build de release deve ou não salvar.
 */
export class TauriSceneFileWriter implements SceneFileWriter {
  constructor(private readonly path = 'scene-data.json') {}

  async save(file: SceneFileV1): Promise<void> {
    // Especificador montado em runtime (array.join) de propósito: bundlers não
    // conseguem dobrar isso num literal, então NÃO tentam resolver
    // `@tauri-apps/plugin-fs` em build (jogo web puro não o tem instalado). Em
    // runtime sob Tauri, o módulo existe e resolve normalmente.
    const spec = ['@tauri-apps', 'plugin-fs'].join('/');
    const fs = (await import(/* @vite-ignore */ spec)) as {
      writeTextFile: (path: string, contents: string) => Promise<void>;
    };
    await fs.writeTextFile(this.path, JSON.stringify(file, null, 2));
  }
}
