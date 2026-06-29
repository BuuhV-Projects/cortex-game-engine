/**
 * Entry point do runtime do engine usado em projetos criados pelo IDE.
 *
 * Re-exporta apenas core + ECS — AI e CLI ficam de fora porque dependem
 * de SDKs Node-only (@anthropic-ai/sdk, commander) que não fazem sentido
 * no runtime do projeto (são ferramentas de autoria, usadas pelo IDE).
 */

// ─── Core ──────────────────────────────────────────────────────────────────────
export * from './core/GameLoop.js';
export * from './core/Game.js';
export * from './core/Renderer.js';
export * from './core/Scene.js';
export * from './core/AssetLoader.js';
export * from './core/AudioManager.js';
export * from './core/InputManager.js';
export * from './core/GamepadManager.js';
export * from './core/Physics.js';
export * from './core/LoadingScreen.js';
export * from './core/Skybox.js';
export * from './core/PostFX.js';
export * from './core/debug.js';

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
export * from './components/Collider2DComponent.js';
export * from './components/PlatformerBodyComponent.js';
export * from './components/PlayerAnimatorComponent.js';
export * from './components/SpriteAnimationComponent.js';
export * from './components/TerrainComponent.js';
export * from './components/CharacterBodyComponent.js';
export * from './components/InteractionComponent.js';
export * from './components/RapierBodyComponent.js';
export * from './components/ScriptComponent.js';

// ─── Scripts anexáveis (estilo MonoBehaviour — ADR-0085) ──────────────────────
export * from './scripts/ScriptBehavior.js';
export * from './scripts/ScriptRegistry.js';

// ─── Física dinâmica (Rapier — WASM; TDR-0002, fase 2/spike) ───────────────────
export * from './physics/RapierPhysics.js';

// ─── Sistemas genéricos ────────────────────────────────────────────────────────
export * from './systems/ScriptHostSystem.js';
export * from './systems/Object3DSyncSystem.js';
export * from './systems/ThirdPersonCameraSystem.js';
export * from './systems/FirstPersonCameraSystem.js';
export * from './systems/PlatformerPhysicsSystem.js';
export * from './systems/PlatformerInputSystem.js';
export * from './systems/FollowCamera2DSystem.js';
export * from './systems/TopDownCameraSystem.js';
export * from './systems/TopDownMovementSystem.js';
export * from './systems/TerrainCollisionSystem.js';
export * from './systems/CharacterPhysicsSystem.js';
export * from './systems/InteractionSystem.js';
export * from './systems/VehicleControlSystem.js';
export * from './systems/SkidMarkSystem.js';
export * from './scene/EngineSound.js';
export * from './ui/Speedometer.js';
export * from './systems/ThirdPersonControlSystem.js';
export * from './systems/RapierPhysicsSystem.js';
export * from './systems/PlatformerAnimationSystem.js';
export * from './systems/SpriteAnimationSystem.js';

// ─── Modo editor (câmera livre + gizmo + HUD) ──────────────────────────────────
// Ferramenta de autoria embutida no jogo (F2). Browser-only.
// NOTA: o modo editor NÃO é exportado aqui — ele é ligado automaticamente pelo
// `Game` só no bundle de desenvolvimento (`index-dev.ts` → `index.dev.js`), pra
// ficar fora do build de produção (ver ADR-0042). Não importe editor do runtime.

// ─── Cena persistida em JSON + IO ──────────────────────────────────────────────
// SceneFile/SceneLoader (runtime) + writers (HTTP/Tauri). O plugin de Vite
// (createSceneSavePlugin) é Node-only e NÃO entra aqui — vive em src/vite/ e é
// distribuído separadamente (vendor/.../vite/sceneSavePlugin.js).
export * from './scene/SceneFile.js';
export * from './scene/SceneLoader.js';
export * from './scene/SceneDefinition.js';
export * from './scene/SceneBuilder.js';
export * from './scene/Kit.js';
export * from './scene/Background.js';
export * from './scene/SceneAnimator.js';
export * from './scene/ModularCharacter.js';
export * from './scene/Platformer.js';
export * from './scene/FirstPerson.js';
export * from './scene/ThirdPerson.js';
export * from './scene/VehicleSetup.js';
export * from './scene/TopDown.js';
export * from './scene/SceneAssets.js';
export * from './scene/Materials.js';
export * from './scene/OutdoorLighting.js';
export * from './scene/Water.js';
export * from './scene/Terrain.js';
export * from './scene/Vegetation.js';
export * from './scene/Sprite.js';
export * from './scene/Spritesheet.js';
export * from './scene/Tilemap.js';
// ─── ProBuilder: malhas de blockout editáveis (ADR-0071) ──────────────────────
// Formas paramétricas (cubo/escada/rampa/arco/parede…) + malha poligonal editável
// (toBufferGeometry flat-shaded + extrusão). Dado puro; a edição vive no editor.
// `Vec3` NÃO é re-exportado aqui (já vem de SceneDefinition — evita ambiguidade).
export {
  toBufferGeometry,
  extrudeFace,
  faceNormal,
  faceCentroid,
  meshEdges,
  cloneMesh,
  type EditableMesh,
  type MeshPickMaps,
  type RenderMesh,
} from './probuilder/EditableMesh.js';
export * from './probuilder/shapes.js';

// ─── Estradas por spline (Road Architect → Cortex, ADR-0072) ──────────────────
// `Vec3` NÃO é re-exportado (já vem de SceneDefinition). Núcleo puro: spline +
// ribbon mesh + catálogo de superfícies.
export { sampleSpline, splineLength, type RoadSample } from './road/RoadSpline.js';
export * from './road/RoadMesh.js';
export * from './road/RoadGrade.js';
export * from './road/surfaces.js';

export * from './io/SceneFileWriter.js';
export * from './io/HttpSceneFileWriter.js';
export * from './io/TauriSceneFileWriter.js';
export * from './io/autoDetectSceneFileWriter.js';

// ─── Narrativa: estado de história + diálogo (ADR-0070) ───────────────────────
// StoryState (flags / base do save narrativo) + diálogo data-driven: grafo (Zod),
// runner puro (testável) e a 1ª UI de runtime do engine (DOM overlay).
export * from './narrative/StoryState.js';
export * from './dialogue/DialogueGraph.js';
export * from './dialogue/DialogueRunner.js';
export * from './dialogue/DialogueUI.js';
export * from './dialogue/startDialogue.js';

// ─── Re-exports de three usados na criação de cenas ───────────────────────────
// Permite que projetos importem essas classes diretamente de
// `cortex-game-engine` em vez de depender de `three` no node_modules
// (que não existe — three está embutido no bundle do engine).
export {
  Mesh,
  InstancedMesh,
  Object3D,
  Group,
  // Câmeras (pra multi-cena: criar uma câmera própria de menu/criador)
  PerspectiveCamera,
  OrthographicCamera,
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
  // Atmosfera — névoa linear/exponencial (some objetos no horizonte → mundo "infinito")
  Fog,
  FogExp2,
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
  // Texturas — carregar/configurar tiling (água, terreno, decals) sem importar
  // `three` direto. RepeatWrapping/ClampToEdgeWrapping evitam o literal 1000/1001.
  Texture,
  TextureLoader,
  RepeatWrapping,
  ClampToEdgeWrapping,
  MirroredRepeatWrapping,
  // Filtros de textura — NearestFilter pra pixel art (sem borrar); LinearFilter
  // (suave) é o default. Evita o literal 1003/1006.
  NearestFilter,
  LinearFilter,
  // Tipos de shadow map (evita o literal 2). PCFSoft = sombras suaves.
  BasicShadowMap,
  PCFShadowMap,
  PCFSoftShadowMap,
  VSMShadowMap,
} from 'three';

// ─── Addons do three (examples/jsm) ───────────────────────────────────────────
// Não fazem parte do entry principal do three; vêm do path de addons e ficam
// embutidos no bundle vendoriado.
// - TransformControls: gizmo de translação/rotação/escala (usado pelo editor).
// - OrbitControls: câmera orbital (útil em ferramentas/preview).
export { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// - SkeletonUtils.clone: clona corretamente meshes com skin (SkinnedMesh).
//   O `Object3D.clone()` do three compartilha o mesmo Skeleton entre os clones,
//   então N cópias de um modelo rigado (Mixamo, characters de GLTF/FBX) ficam
//   grudadas/invisíveis. Use `clone(model)` em vez de `model.clone(true)` para
//   instanciar vários inimigos/NPCs do mesmo GLTF skinned.
export { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

// ─── Pós-processamento (WebGPU) ────────────────────────────────────────────────
// O engine é WebGPU-only (ADR-0032), então o caminho de pós-processamento é o
// `RenderPipeline` de `three/webgpu` com nós TSL — NÃO o `EffectComposer`
// clássico de `examples/jsm/postprocessing/` (esse é WebGL e não funciona com o
// WebGPURenderer). Para os casos comuns prefira a classe `PostFX` (core), que
// consolida pipeline + pass + bloom. Para montar pipelines à mão, use
// `RenderPipeline` + `pass`/`bloom`/`mrt`/`output` direto. Ver ADR-0035.
// `PostProcessing` é o nome antigo do `RenderPipeline` (deprecado desde r183),
// mantido aqui por compatibilidade.
export { RenderPipeline, PostProcessing } from 'three/webgpu';
export { pass, mrt, output, renderOutput } from 'three/tsl';
export { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
export { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';

// Constantes de tone mapping — pra `PostFX.toneMapping` (ou
// `renderer.threeRenderer.toneMapping`). Sem isso o projeto não tem como
// referenciar esses modos (não importa `three` direto).
export {
  NoToneMapping,
  LinearToneMapping,
  ReinhardToneMapping,
  CineonToneMapping,
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
} from 'three';

// HDRI: loader e o mapping usados pelo Skybox; expostos pra uso avançado direto.
export { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
export { EquirectangularReflectionMapping } from 'three';
