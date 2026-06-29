import type { Object3D, PerspectiveCamera } from 'three';
import type { Game } from '../core/Game.js';
import { RapierPhysics, type Vehicle, type VehicleWheelSpec } from '../physics/RapierPhysics.js';
import { VehicleControlSystem, type VehicleControlOptions } from '../systems/VehicleControlSystem.js';
import { SkidMarkSystem } from '../systems/SkidMarkSystem.js';
import { EngineSound } from './EngineSound.js';
import { Speedometer } from '../ui/Speedometer.js';
import { AudioManager } from '../core/AudioManager.js';
import { AssetLoader } from '../core/AssetLoader.js';

/**
 * Estado compartilhado do carro, exposto em `carObj.userData.cortexCarRig` pra o jogo
 * orquestrar (invocar/entrar/sair) via script (ADR-0086). A FÍSICA + controle ficam nos
 * sistemas criados aqui; o rig é só o ponto de encontro (referências + flags).
 */
export interface VehicleRig {
  vehicle: Vehicle | null;
  carObj: Object3D;
  /** Player (pra esconder ao entrar / reposicionar ao sair) — o jogo preenche. */
  player: Object3D | null;
  /** Transform ECS do player (reposiciona ao sair) — o jogo preenche. */
  playerT: { x: number; y: number; z: number } | null;
  /** `driving`/`spawned` — o MESMO objeto que o jogo usa em pauseWhen/interação. */
  state: { driving: boolean; spawned: boolean };
  getEngineSound: () => EngineSound | null;
  /** A interação "Entrar" levanta isto; o script consome. */
  enterRequested: boolean;
}

/** Config do {@link setupVehicle} — layout do `.glb` (rodas/chassi) + tunáveis. */
export interface VehicleSetupConfig {
  chassisHalfExtents: { x: number; y: number; z: number };
  chassisOffset?: { x: number; y: number; z: number };
  centerOfMass?: { x: number; y: number; z: number };
  mass?: number;
  suspensionRestLength?: number;
  suspensionStiffness?: number;
  frictionSlip?: number;
  wheels: VehicleWheelSpec[];
  /** Nomes das malhas das rodas no `.glb`, na ordem de `wheels`. Default `['FL','FR','RL','RR']`. */
  wheelNames?: string[];
  engineForce?: number;
  maxBrake?: number;
  handbrakeForce?: number;
  rollingResistance?: number;
  reverseForce?: number;
  maxReverseSpeed?: number;
  maxSteer?: number;
  maxSpeedKmh?: number;
  engineLayers?: { onLow?: string; onMid?: string; onHigh?: string; offLow?: string; offMid?: string; offHigh?: string; offVeryHigh?: string };
  /** Máx. do velocímetro (km/h). Default 260. */
  speedoMax?: number;
}

/** Handle de {@link setupVehicle}: o que o jogo usa no loop (velocímetro/som/tune). */
export interface VehicleHandle {
  vehicle: Vehicle;
  rig: VehicleRig;
  speedo: Speedometer;
  options: VehicleControlOptions;
  engineSound: EngineSound | null;
}

/**
 * **Liga um carro raycast (Rapier — ADR-0081) num {@link Game} com uma chamada** (estilo
 * `setupThirdPerson`). Cria a física + colliders do terreno/road, o veículo, o
 * {@link VehicleControlSystem}, marcas de pneu, som de motor em camadas e o velocímetro;
 * esconde o carro (nasce invocado pelo jogo) e expõe o {@link VehicleRig} em
 * `carObj.userData.cortexCarRig`. Devolve o handle pro loop do jogo (velocímetro/som/tune).
 *
 * O `state` é passado de fora (o MESMO objeto que o jogo usa em `pauseWhen`/interação), pra o
 * `driving`/`spawned` valerem em todos os lugares. Infra reutilizável — sem cola no `main.ts`.
 */
export async function setupVehicle(
  game: Game,
  carObj: Object3D,
  state: { driving: boolean; spawned: boolean },
  cfg: VehicleSetupConfig,
): Promise<VehicleHandle> {
  const physics = await RapierPhysics.create();
  // Terreno + road viram colliders estáticos (as rodas raycastam no WASM).
  game.scene.getThreeScene().traverse((o: Object3D) => {
    const ud = o.userData as Record<string, unknown>;
    if (ud['cortexTerrain'] || ud['cortexRoad']) physics.addTrimeshFromObject(o);
  });
  const vehicle = physics.createVehicle({
    position: { x: carObj.position.x, y: carObj.position.y + 2, z: carObj.position.z },
    chassisHalfExtents: cfg.chassisHalfExtents,
    chassisOffset: cfg.chassisOffset ?? { x: 0, y: 0.5, z: 0 },
    centerOfMass: cfg.centerOfMass ?? { x: 0, y: 0.2, z: 0 },
    mass: cfg.mass ?? 1000,
    suspensionRestLength: cfg.suspensionRestLength ?? 0.3,
    suspensionStiffness: cfg.suspensionStiffness ?? 24,
    frictionSlip: cfg.frictionSlip ?? 8,
    wheels: cfg.wheels,
  });
  const wheelObjects = (cfg.wheelNames ?? ['FL', 'FR', 'RL', 'RR'])
    .map((n) => carObj.getObjectByName(n))
    .filter((o): o is Object3D => !!o);
  const options: VehicleControlOptions = {
    active: () => state.driving,
    pauseWhen: () => game.editorActive || game.gameplayPaused,
    engineForce: cfg.engineForce ?? 4000,
    maxBrake: cfg.maxBrake ?? 50,
    handbrakeForce: cfg.handbrakeForce ?? 120,
    rollingResistance: cfg.rollingResistance ?? 6,
    reverseForce: cfg.reverseForce ?? 3200,
    maxReverseSpeed: cfg.maxReverseSpeed ?? 8.33,
    maxSteer: cfg.maxSteer ?? 0.85,
    maxSpeedKmh: cfg.maxSpeedKmh ?? 260,
    wheelObjects,
  };
  game.world.addSystem(
    new VehicleControlSystem(physics, vehicle, carObj, game.camera as PerspectiveCamera, game.gamepad, game.input, options),
  );
  game.world.addSystem(
    new SkidMarkSystem(vehicle, game.scene.getThreeScene(), {
      active: () => state.driving,
      pauseWhen: () => game.editorActive || game.gameplayPaused,
      skidding: () => (game.gamepad.getButtonValue(0, 6) > 0.6 || game.input.isKeyDown('s')) && Math.abs(vehicle.forwardSpeed()) > 5,
    }),
  );
  // Som de motor EM CAMADAS (crossfade on/off × RPM) — opcional (vem do dado da cena).
  let engineSound: EngineSound | null = null;
  if (cfg.engineLayers) {
    const audio = new AudioManager();
    game.camera.add(audio.listener);
    const loader = new AssetLoader();
    const L = cfg.engineLayers;
    const load = async (p?: string): Promise<ReturnType<AudioManager['createSound']> | undefined> =>
      p ? audio.createSound(await loader.loadAudio(p), { loop: true, volume: 0 }) : undefined;
    const [onLow, onMid, onHigh, offLow, offMid, offHigh, offVeryHigh] = await Promise.all([
      load(L.onLow), load(L.onMid), load(L.onHigh), load(L.offLow), load(L.offMid), load(L.offHigh), load(L.offVeryHigh),
    ]);
    engineSound = new EngineSound([
      { rpm: 0.0, on: onLow, off: offLow },
      { rpm: 0.45, on: onMid, off: offMid },
      { rpm: 0.8, on: onHigh, off: offHigh },
      { rpm: 1.0, on: onHigh, off: offVeryHigh },
    ]);
  }
  const speedo = new Speedometer({ maxSpeed: cfg.speedoMax ?? 260 });
  speedo.setVisible(false);
  carObj.visible = false; // não nasce na cena — o CarroController invoca (P / Y)

  const rig: VehicleRig = {
    vehicle,
    carObj,
    player: null,
    playerT: null,
    state,
    getEngineSound: () => engineSound,
    enterRequested: false,
  };
  (carObj.userData as Record<string, unknown>)['cortexCarRig'] = rig;

  return { vehicle, rig, speedo, options, engineSound };
}
