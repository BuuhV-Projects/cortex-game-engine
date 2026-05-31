import type { SceneFileV1 } from '../scene/SceneFile.js';

/**
 * Abstração de escrita do `SceneFileV1`. No browser puro não dá pra gravar
 * arquivo do projeto — daí as implementações: HTTP (Vite dev) e Tauri (build).
 */
export interface SceneFileWriter {
  save(file: SceneFileV1): Promise<void>;
}
