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
export * from './core/GamepadManager.js';
export * from './core/Physics.js';

// ─── ECS ───────────────────────────────────────────────────────────────────────
export * from './ecs/Entity.js';
export * from './ecs/Component.js';
export * from './ecs/System.js';
export * from './ecs/World.js';

// ─── Componentes de gameplay genéricos ────────────────────────────────────────
// Transform lógico + ligação ao Object3D, corpo cinemático (gravidade/colisão
// por raycast) e marcadores. Reutilizáveis por qualquer jogo (ver ADR).
export * from './components/TransformComponent.js';
export * from './components/Object3DComponent.js';
export * from './components/KinematicBodyComponent.js';
export * from './components/FollowCameraTargetComponent.js';
export * from './components/EditableTargetComponent.js';

// ─── Sistemas genéricos ────────────────────────────────────────────────────────
export * from './systems/Object3DSyncSystem.js';

// ─── Física cinemática de veículo (raycast) ────────────────────────────────────
// Gravidade + ground-snap e colisão lateral com deslize, e o agrupador
// VehiclePhysics. Distinta do PhysicsSystem de impulso (src/core/Physics.js).
export * from './physics/VehicleGravitySystem.js';
export * from './physics/VehicleWallCollisionSystem.js';
export * from './physics/VehiclePhysics.js';

// ─── Re-exports de three usados na criação de cenas ───────────────────────────
// Permite que projetos importem essas classes diretamente de
// `cortex-game-engine` em vez de depender de `three` no node_modules
// (que não existe — three está embutido no bundle do engine).
export {
  Mesh,
  InstancedMesh,
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
  Matrix3,
  Matrix4,
  MathUtils,
  // Animação esqueletal — necessária pra tocar animações de FBX
  // (rigged characters de Mixamo, etc.)
  AnimationMixer,
  AnimationClip,
  AnimationAction,
  Clock,
  SkinnedMesh,
  Bone,
  Skeleton,
  // Instancing — N cópias do mesmo mesh com matrices/cores diferentes
  // numa única draw call. Essencial pra cenários densos (cidade, grama,
  // partículas, multidão) sem matar o framerate.
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  DynamicDrawUsage,
  StaticDrawUsage,
  StreamDrawUsage,
  // Math/colisão auxiliares úteis pra culling manual em cenários grandes
  Box3,
  Sphere,
  Frustum,
  Plane,
  Ray,
  Raycaster,
  // Áudio — evita import direto de `three` no projeto (que não tem three no
  // node_modules). Audio não-posicional, posicional e o listener da câmera.
  Audio,
  PositionalAudio,
  AudioListener,
  // Constantes de `side` de materiais (projetos usavam o literal 2 por falta delas).
  DoubleSide,
  FrontSide,
  BackSide,
} from 'three';

// ─── Addons do three (examples/jsm) ───────────────────────────────────────────
// Não fazem parte do entry principal do three; vêm do path de addons e ficam
// embutidos no bundle vendoriado.
// - TransformControls: gizmo de translação/rotação/escala (usado pelo editor).
// - OrbitControls: câmera orbital (útil em ferramentas/preview).
export { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
