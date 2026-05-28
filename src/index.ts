/**
 * Ponto de entrada público do motor de jogo.
 *
 * Re-exporta todas as classes e tipos públicos dos subsistemas:
 * - Core: GameLoop, Renderer, Scene, AssetLoader, AudioManager, InputManager, GamepadManager
 * - Physics: RigidBodyComponent, ColliderComponent, PhysicsSystem
 * - ECS: Entity, Component, System, World
 * - AI: ScriptGenerator, BlenderModelGenerator
 *
 * Referências: ADR-0001 (Three.js), ADR-0002 (ECS), ADR-0023 (Split-screen e gamepad)
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

// ─── AI ────────────────────────────────────────────────────────────────────────
export * from './ai/ScriptGenerator.js';
export * from './ai/BlenderModelGenerator.js';
