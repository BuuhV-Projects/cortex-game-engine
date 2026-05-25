/**
 * Entry point do runtime do engine usado em projetos criados pelo IDE.
 *
 * Re-exporta apenas core + ECS — AI e CLI ficam de fora porque dependem
 * de SDKs Node-only (@anthropic-ai/sdk, commander) que não fazem sentido
 * no runtime do projeto (são ferramentas de autoria, usadas pelo IDE).
 */

// ─── Core ──────────────────────────────────────────────────────────────────────
export * from './core/GameLoop.js';
export * from './core/Renderer.js';
export * from './core/Scene.js';
export * from './core/AssetLoader.js';
export * from './core/AudioManager.js';
export * from './core/InputManager.js';
export * from './core/Physics.js';

// ─── ECS ───────────────────────────────────────────────────────────────────────
export * from './ecs/Entity.js';
export * from './ecs/Component.js';
export * from './ecs/System.js';
export * from './ecs/World.js';

// ─── Re-exports de three usados na criação de cenas ───────────────────────────
// Permite que projetos importem essas classes diretamente de
// `cortex-game-engine` em vez de depender de `three` no node_modules
// (que não existe — three está embutido no bundle do engine).
export {
  Mesh,
  Object3D,
  Group,
  // Geometrias
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  CylinderGeometry,
  ConeGeometry,
  TorusGeometry,
  // Materiais
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshPhongMaterial,
  MeshLambertMaterial,
  LineBasicMaterial,
  // Luzes
  AmbientLight,
  DirectionalLight,
  PointLight,
  SpotLight,
  HemisphereLight,
  // Tipos auxiliares
  Color,
  Vector2,
  Vector3,
  Quaternion,
  Euler,
  Matrix4,
} from 'three';
