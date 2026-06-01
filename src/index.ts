/**
 * Ponto de entrada público COMPLETO do motor de jogo.
 *
 * É o superconjunto: tudo que o runtime expõe (`index-runtime.ts`) MAIS os
 * subsistemas de autoria que são Node-only (AI). Mantido como
 * `index-runtime + AI` de propósito, pra nunca desincronizar do runtime quando
 * um módulo novo é adicionado lá.
 *
 * - Runtime (via `./index-runtime.js`): core (GameLoop, Renderer, Scene,
 *   AssetLoader, AudioManager, InputManager, GamepadManager, Physics,
 *   LoadingScreen, Skybox, PostFX), ECS, components, systems, physics de
 *   veículo, editor, scene/IO, re-exports de three (mesh/geometrias/materiais/
 *   luzes/áudio/etc.), addons (TransformControls, OrbitControls, clone),
 *   pós-processamento WebGPU (RenderPipeline, pass, bloom, fxaa, tone mapping…)
 *   e HDRI (RGBELoader).
 * - AI: ScriptGenerator, BlenderModelGenerator (dependem de @anthropic-ai/sdk;
 *   ferramentas de autoria do IDE, NÃO vão pro bundle do projeto — por isso
 *   ficam aqui e não no `index-runtime.ts`).
 *
 * Referências: ADR-0001 (Three.js), ADR-0002 (ECS), ADR-0035 (pós-processamento
 * e Skybox/HDRI). O bundle vendorizado em projetos usa `index-runtime.ts`.
 */

// ─── Runtime completo (browser) ─────────────────────────────────────────────────
export * from './index-runtime.js';

// ─── AI (Node-only — autoria do IDE) ───────────────────────────────────────────
export * from './ai/ScriptGenerator.js';
export * from './ai/BlenderModelGenerator.js';
