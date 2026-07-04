import { HttpSceneFileWriter } from './HttpSceneFileWriter.js';
import { TauriSceneFileWriter } from './TauriSceneFileWriter.js';
import type { SceneFileWriter } from './SceneFileWriter.js';

/**
 * Escolhe o writer conforme o ambiente em runtime (sem `import.meta.env`, que
 * seria avaliado no build do engine, não no do jogo):
 *
 * - Tauri (`window.__TAURI_INTERNALS__`/`__TAURI__`) → {@link TauriSceneFileWriter}
 * - caso contrário → {@link HttpSceneFileWriter} (dev server Vite)
 *
 * Retorna `null` fora do browser.
 */
export function autoDetectSceneFileWriter(options?: {
  /** Endpoint do plugin Vite (dev). */
  httpUrl?: string;
  /** Caminho do arquivo no Tauri (tem precedência sobre `path` no Tauri). */
  tauriPath?: string;
  /**
   * Caminho do scene-data relativo à raiz do projeto (ex.:
   * `assets/scene-data-fase2.json` — overlay por fase). Vale pros dois
   * ambientes; sem ele, cada writer usa seu default.
   */
  path?: string;
}): SceneFileWriter | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  if (w['__TAURI_INTERNALS__'] || w['__TAURI__']) {
    return new TauriSceneFileWriter(options?.tauriPath ?? options?.path);
  }
  return new HttpSceneFileWriter(options?.httpUrl, options?.path);
}
