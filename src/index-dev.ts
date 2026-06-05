/**
 * Entry de **desenvolvimento** do engine (gera `index.dev.js`).
 *
 * Re-exporta tudo do runtime e, por cima, o **modo editor** — e o registra no
 * {@link Game} pra ser ligado automaticamente. A IDE vendoriza este bundle e o
 * `vite.config.ts` do projeto o usa só em `mode=development`; no build de
 * produção o projeto usa `index.js` (runtime, sem editor), então o editor não
 * pesa no jogo final. Ver ADR-0042.
 */
export * from './index-runtime.js';

// Editor (só existe neste bundle de dev).
export * from './editor/EditorState.js';
export * from './editor/EditorSelection.js';
export * from './editor/EditorHud.js';
export * from './editor/EditorOutliner.js';
export * from './editor/EditorInspector.js';
export * from './editor/EditorCameraSystem.js';
export * from './editor/ObjectEditSystem.js';
export * from './editor/attachEditor.js';

// Liga o editor a todo Game criado (efeito colateral de importar este bundle).
import { registerEditorAttacher } from './core/Game.js';
import { attachEditor } from './editor/attachEditor.js';
registerEditorAttacher(attachEditor);
