/**
 * Entry point do runtime do engine usado em projetos criados pelo IDE.
 *
 * Re-exporta apenas core + ECS — AI e CLI ficam de fora porque dependem
 * de SDKs Node-only (@anthropic-ai/sdk, commander) que não fazem sentido
 * no runtime do projeto (são ferramentas de autoria, usadas pelo IDE).
 */
export * from './core/GameLoop.js';
export * from './core/Renderer.js';
export * from './core/Scene.js';
export * from './core/AssetLoader.js';
export * from './core/AudioManager.js';
export * from './core/InputManager.js';
export * from './core/GamepadManager.js';
export * from './core/Physics.js';
export * from './ecs/Entity.js';
export * from './ecs/Component.js';
export * from './ecs/System.js';
export * from './ecs/World.js';
export { Mesh, Object3D, Group, BoxGeometry, SphereGeometry, PlaneGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, MeshBasicMaterial, MeshStandardMaterial, MeshPhongMaterial, MeshLambertMaterial, LineBasicMaterial, AmbientLight, DirectionalLight, PointLight, SpotLight, HemisphereLight, Color, Vector2, Vector3, Quaternion, Euler, Matrix4, AnimationMixer, AnimationClip, AnimationAction, Clock, SkinnedMesh, Bone, Skeleton, } from 'three';
//# sourceMappingURL=index-runtime.d.ts.map