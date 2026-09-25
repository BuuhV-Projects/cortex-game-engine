/// <reference types="vite/client" />
/**
 * **Cena de validação do piloto no veículo** (SPEC-0275) — kart + piloto +
 * teclado, com o estado de animação alternável na mão e, em dev, o clipe ativo
 * e o relatório de anchors/bones/clipes.
 *
 * Uso: `yarn dev:vehicle-driver`. Para testar GLBs reais, ponha os arquivos em
 * `examples/vehicle-driver/public/` e abra `?vehicle=/kart.glb&driver=/piloto.glb`
 * (um só também vale; o outro fica procedural).
 *
 * O movimento do kart aqui é cinemático de propósito: a cena valida a animação,
 * não a física (essa é do `VehicleArcadeSystem`).
 */
import {
  AssetLoader,
  DirectionalLight,
  Game,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  BoxGeometry,
  VEHICLE_ANIM_STATES,
  formatVehicleAssetReport,
  setupVehicleDriver,
  type VehicleAnimState,
} from '../../src/index-runtime.js';
import type { AnimationClip, Object3D } from 'three';
import { WHEEL_RADIUS, createDriver, createDriverClips, createKart } from './proceduralAssets.js';

// ─── Tuning do kart de teste (m, s, rad) ───────────────────────────────────────
const ACCEL = 8;
const BRAKE_DECEL = 14;
const DRAG = 0.6;
const MAX_SPEED = 18;
const MAX_REVERSE = 5;
const TURN_RATE = 1.6;
const DRIFT_TURN_BOOST = 1.5;
const STEER_RESPONSE = 6;
const STEERING_WHEEL_TURN = 1.2;
const MIN_TURN_SPEED = 0.3;
const STOP_EPSILON = 0.5;
// ─── Câmera de perseguição ─────────────────────────────────────────────────────
const CAM_BACK = 4;
const CAM_UP = 1.8;
const CAM_LOOK_UP = 0.6;
const CAM_FOLLOW = 5;
/** Câmera lateral (tecla C): distância ao lado do kart, para ver mãos e pés. */
const CAM_SIDE = 2.6;
const CAM_SIDE_UP = 0.9;
// ─── Chão e marcos para dar noção de velocidade ────────────────────────────────
const GROUND_SIZE = 400;
const MARKER_COUNT = 120;
const MARKER_SPREAD = 160;

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLPreElement;
const game = new Game({ canvas });
const scene = game.scene.getThreeScene();

scene.add(new HemisphereLight(0xdfe8ff, 0x4a5a3a, 1.2));
const sun = new DirectionalLight(0xffffff, 2);
sun.position.set(10, 20, 8);
scene.add(sun);
const ground = new Mesh(new PlaneGeometry(GROUND_SIZE, GROUND_SIZE), new MeshStandardMaterial({ color: 0x5f8f4e }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const markerMat = new MeshStandardMaterial({ color: 0xd9c38a });
for (let i = 0; i < MARKER_COUNT; i++) {
  const m = new Mesh(new BoxGeometry(0.6, 1.2, 0.6), markerMat);
  // espalhamento determinístico (sem Math.random: a cena é igual a cada abertura)
  m.position.set(Math.sin(i * 12.9898) * MARKER_SPREAD, 0.6, Math.cos(i * 78.233) * MARKER_SPREAD);
  scene.add(m);
}

// ─── Assets: GLB por query, senão procedural ──────────────────────────────────
const query = new URLSearchParams(location.search);
const loader = new AssetLoader();
async function loadAssets(): Promise<{ vehicle: Object3D; driver: Object3D; clips: AnimationClip[] }> {
  const vehicleUrl = query.get('vehicle');
  const driverUrl = query.get('driver');
  const vehicle = vehicleUrl ? (await loader.loadGLTF(vehicleUrl)).scene : createKart();
  if (!driverUrl) return { vehicle, driver: createDriver(), clips: createDriverClips() };
  const gltf = await loader.loadGLTF(driverUrl);
  return { vehicle, driver: gltf.scene, clips: gltf.animations };
}

const { vehicle, driver, clips } = await loadAssets();
scene.add(vehicle);

let handle: ReturnType<typeof setupVehicleDriver>;
try {
  handle = setupVehicleDriver(game.world, { vehicle, driver, clips });
} catch (err) {
  hud.textContent = (err as Error).message;
  throw err;
}
const { params, animator, pose, report } = handle;
const reportText = formatVehicleAssetReport(report);
const steeringWheel = vehicle.getObjectByName('volante');
const steeringWheelRest = steeringWheel?.rotation.z ?? 0;
const wheels = ['roda_frente_esquerda', 'roda_frente_direita', 'roda_traseira_esquerda', 'roda_traseira_direita']
  .map((n) => vehicle.getObjectByName(n))
  .filter((o): o is Object3D => !!o);

// ─── Loop ──────────────────────────────────────────────────────────────────────
let speed = 0;
let steer = 0;
let yaw = 0;
let sideCam = false;
let cWasDown = false;
const keys = game.input;

game.onUpdate((dt) => {
  // 1–8 força um estado, 0 volta ao automático.
  VEHICLE_ANIM_STATES.forEach((state: VehicleAnimState, i) => {
    if (keys.isKeyDown(String(i + 1))) animator.forcedState = state;
  });
  if (keys.isKeyDown('0')) animator.forcedState = null;

  const throttle = keys.isKeyDown('w') || keys.isKeyDown('ArrowUp') ? 1 : 0;
  const brake = keys.isKeyDown('s') || keys.isKeyDown('ArrowDown') ? 1 : 0;
  const steerIn = (keys.isKeyDown('d') || keys.isKeyDown('ArrowRight') ? 1 : 0) - (keys.isKeyDown('a') || keys.isKeyDown('ArrowLeft') ? 1 : 0);
  steer += (steerIn - steer) * Math.min(1, dt * STEER_RESPONSE);
  const drifting = keys.isKeyDown(' ') && Math.abs(steer) > MIN_TURN_SPEED && speed > MIN_TURN_SPEED;

  speed += throttle * ACCEL * dt;
  if (brake) speed = speed > STOP_EPSILON ? speed - BRAKE_DECEL * dt : Math.max(-MAX_REVERSE, speed - ACCEL * dt);
  speed -= speed * DRAG * dt;
  speed = Math.min(MAX_SPEED, speed);
  // +steer = direita = yaw negativo (girar em +Y leva +Z para +X, a esquerda)
  yaw -= steer * TURN_RATE * (drifting ? DRIFT_TURN_BOOST : 1) * Math.sign(speed) * Math.min(1, Math.abs(speed)) * dt;
  vehicle.rotation.y = yaw;
  vehicle.position.x += Math.sin(yaw) * speed * dt;
  vehicle.position.z += Math.cos(yaw) * speed * dt;

  params.speed = speed;
  params.steer = steer;
  params.throttle = throttle;
  params.brake = brake && speed > STOP_EPSILON ? 1 : 0;
  params.drift = drifting ? Math.sign(steer) : 0;

  // Visual do kart (do exemplo, não da engine): volante e rodas.
  if (steeringWheel) steeringWheel.rotation.z = steeringWheelRest - steer * STEERING_WHEEL_TURN;
  for (const w of wheels) w.rotation.x += (speed / WHEEL_RADIUS) * dt;

  const cDown = keys.isKeyDown('c');
  if (cDown && !cWasDown) sideCam = !sideCam;
  cWasDown = cDown;
  const cam = game.camera;
  // por trás, ou pela esquerda do kart (+X local = esquerda)
  const tx = vehicle.position.x + (sideCam ? Math.cos(yaw) * CAM_SIDE : -Math.sin(yaw) * CAM_BACK);
  const tz = vehicle.position.z + (sideCam ? -Math.sin(yaw) * CAM_SIDE : -Math.cos(yaw) * CAM_BACK);
  const k = Math.min(1, dt * CAM_FOLLOW);
  cam.position.set(cam.position.x + (tx - cam.position.x) * k, vehicle.position.y + (sideCam ? CAM_SIDE_UP : CAM_UP), cam.position.z + (tz - cam.position.z) * k);
  cam.lookAt(vehicle.position.x, vehicle.position.y + CAM_LOOK_UP, vehicle.position.z);

  if (import.meta.env.DEV) {
    const c = pose.current;
    hud.textContent = [
      `estado: ${animator.state}${animator.forcedState ? ' (forçado)' : ''}`,
      `clipe ativo: ${animator.activeClip ?? '(nenhum)'}`,
      `speed ${speed.toFixed(1)} m/s  steer ${steer.toFixed(2)}  throttle ${throttle}  brake ${params.brake}  drift ${params.drift}`,
      `pose: roll ${c.roll.toFixed(3)}  pitch ${c.pitch.toFixed(3)}  headYaw ${c.headYaw.toFixed(3)}` +
        (pose.missingBones.length ? `  (bones ignorados: ${pose.missingBones.join(', ')})` : ''),
      '',
      reportText,
      `anchors: ${report.anchors.found.join(', ')}`,
      `bones: ${report.bones.found.join(', ')}`,
      `clipes: ${report.clips.found.join(', ')}`,
      '',
      'W/S acelera/freia · A/D esterça · Espaço drift · 1–8 força estado · 0 automático · C câmera lateral',
      VEHICLE_ANIM_STATES.map((s, i) => `${i + 1}=${s}`).join('  '),
    ].join('\n');
  }
});

game.start();
