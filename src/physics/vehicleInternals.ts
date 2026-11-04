// Partes internas do Vehicle (SPEC-0671): montagem do controller, pose das
// rodas, anti-capotamento, massa e tuning. NÃO é API pública — o `.d.ts` do
// RapierPhysics não referencia este módulo.
import type RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, Quaternion } from 'three';
import type { Vec3Like, VehicleSpec } from './RapierPhysics.js';
import type { RapierApi } from './rapierRuntime.js';

type Controller = RAPIER.DynamicRayCastVehicleController;

/** Suspensão padrão do `RapierPhysics.createVehicle`. */
export const DEFAULT_SUSPENSION_REST_LENGTH = 0.3;
export const DEFAULT_SUSPENSION_STIFFNESS = 24;
/**
 * Correção de rolagem (rad/s por passo) abaixo da qual o `Vehicle.keepUpright`
 * não escreve nada: ~0,0006°/s, invisível, e o caso comum de carro nivelado.
 */
const UPRIGHT_MIN_CORRECTION = 1e-5;

// Scratch reutilizável (sem alocar por frame) pro transform das rodas.
const _wv = new Vector3();
const _wq = new Quaternion();
const _wq2 = new Quaternion();
const _wax = new Vector3();

/** Chassi (corpo dinâmico + caixa) e controller com as rodas da spec. */
export function buildVehicleController(
  R: RapierApi,
  world: RAPIER.World,
  spec: VehicleSpec,
): { ctrl: Controller; chassis: RAPIER.RigidBody; restLength: number; stiffness: number } {
  const he = spec.chassisHalfExtents;
  const desc = R.RigidBodyDesc.dynamic();
  if (spec.position) desc.setTranslation(spec.position.x, spec.position.y, spec.position.z);
  // Pode dormir (SPEC-0655): o VehicleArcadeSystem põe o carro parado para dormir, e
  // `setEngineForce`/`setSteering` o acordam. Com `setCanSleep(false)` o Rapier o acordava no passo seguinte.
  const chassis = world.createRigidBody(desc);
  const cd = R.ColliderDesc.cuboid(he.x, he.y, he.z).setFriction(spec.chassisFriction ?? 0.4);
  if (spec.chassisOffset) cd.setTranslation(spec.chassisOffset.x, spec.chassisOffset.y, spec.chassisOffset.z);
  // CM EXPLÍCITO (anti-capotamento): collider sem massa; massa/CM/inércia vão por
  // `vehicle.setMassProperties` — também usado pra editar massa/CM AO VIVO.
  if (spec.centerOfMass) cd.setDensity(0);
  else cd.setMass(spec.mass ?? 1200);
  world.createCollider(cd, chassis);

  const ctrl = world.createVehicleController(chassis);
  ctrl.indexUpAxis = 1; // Y é "pra cima" (a API é propriedade, não método)
  const restLength = spec.suspensionRestLength ?? DEFAULT_SUSPENSION_REST_LENGTH;
  const stiffness = spec.suspensionStiffness ?? DEFAULT_SUSPENSION_STIFFNESS;
  for (const w of spec.wheels) {
    ctrl.addWheel(
      { x: w.position.x, y: w.position.y, z: w.position.z },
      { x: 0, y: -1, z: 0 }, // suspensão aponta pra baixo
      { x: -1, y: 0, z: 0 }, // eixo da roda = X (→ frente = +Z)
      restLength,
      w.radius,
    );
  }
  for (let i = 0; i < spec.wheels.length; i++) {
    ctrl.setWheelSuspensionStiffness(i, stiffness);
    ctrl.setWheelSuspensionCompression(i, spec.suspensionCompression ?? 0.82);
    ctrl.setWheelSuspensionRelaxation(i, spec.suspensionRelaxation ?? 0.88);
    ctrl.setWheelMaxSuspensionTravel(i, spec.maxSuspensionTravel ?? 0.3);
    ctrl.setWheelFrictionSlip(i, (spec.frictionSlip ?? 2.5) * (spec.wheels[i]?.gripScale ?? 1)); // grip (×escala da roda)
  }
  return { ctrl, chassis, restLength, stiffness };
}

/** Inércia de caixa (`m/3·(a²+b²)`) com a guinada escalada; aplica massa + CM no chassi. */
export function applyBoxMassProperties(
  body: RAPIER.RigidBody,
  he: Vec3Like,
  mass: number,
  centerOfMass: Vec3Like,
  yawInertiaScale: number,
): void {
  const ix = (mass / 3) * (he.y * he.y + he.z * he.z);
  // Inércia de GUINADA (eixo Y / curva): escalar < 1 deixa o carro mais ágil pra virar
  // (menos "pesado"); 1 = físico. Entendimento (vira a roda mas o carro não roda) cai com isso.
  const iy = (mass / 3) * (he.x * he.x + he.z * he.z) * yawInertiaScale;
  const iz = (mass / 3) * (he.x * he.x + he.y * he.y);
  body.setAdditionalMassProperties(
    mass,
    { x: centerOfMass.x, y: centerOfMass.y, z: centerOfMass.z },
    { x: ix, y: iy, z: iz },
    { x: 0, y: 0, z: 0, w: 1 },
    true,
  );
}

/** Velocidade do chassi ao longo do eixo LOCAL (`ax`,`ay`,`az`), m/s. */
export function axisSpeed(body: RAPIER.RigidBody, ax: number, ay: number, az: number): number {
  const v = body.linvel();
  const r = body.rotation();
  _wv.set(ax, ay, az).applyQuaternion(_wq.set(r.x, r.y, r.z, r.w));
  return v.x * _wv.x + v.y * _wv.y + v.z * _wv.z;
}

/** Pose LOCAL da roda `i` (conexão − suspensão; esterço no Y, giro `spin` no X). */
export function writeWheelLocalPose(ctrl: Controller, i: number, outPos: Vector3, outQuat: Quaternion, spin: number): void {
  const cp = ctrl.wheelChassisConnectionPointCs(i) ?? { x: 0, y: 0, z: 0 };
  const len = ctrl.wheelSuspensionLength(i) ?? 0;
  outPos.set(cp.x, cp.y - len, cp.z);
  const steer = ctrl.wheelSteering(i) ?? 0;
  outQuat.setFromAxisAngle(_wax.set(0, 1, 0), steer); // esterço (Y)
  outQuat.multiply(_wq2.setFromAxisAngle(_wax.set(1, 0, 0), spin)); // giro (eixo X)
}

/** Pose MUNDIAL da roda `i`: a local (com o giro do Rapier) composta com o chassi. */
export function writeWheelWorldPose(
  ctrl: Controller,
  body: RAPIER.RigidBody,
  i: number,
  outPos: Vector3,
  outQuat: Quaternion,
): void {
  writeWheelLocalPose(ctrl, i, outPos, outQuat, ctrl.wheelRotation(i) ?? 0);
  const t = body.translation();
  const r = body.rotation();
  _wq.set(r.x, r.y, r.z, r.w); // rotação do chassi
  outPos.applyQuaternion(_wq);
  outPos.x += t.x;
  outPos.y += t.y;
  outPos.z += t.z;
  outQuat.premultiply(_wq);
}

/** Correção de rolagem do `Vehicle.keepUpright` (só escreve acima do mínimo — SPEC-0337). */
export function applyUprightCorrection(body: RAPIER.RigidBody, strength: number, damping: number, dt: number): void {
  const r = body.rotation();
  _wq.set(r.x, r.y, r.z, r.w);
  const rightY = _wv.set(1, 0, 0).applyQuaternion(_wq).y; // 0 = de pé; ≠0 = inclinado
  _wax.set(0, 0, 1).applyQuaternion(_wq); // forward = eixo da rolagem
  const av = body.angvel();
  const rollRate = av.x * _wax.x + av.y * _wax.y + av.z * _wax.z;
  const delta = (-rightY * strength - rollRate * damping) * dt;
  // Nivelado e sem rolar: nada a corrigir — sem escrita (e sem acordar o
  // corpo, o que deixava QUALQUER veículo com estabilizador sempre acordado).
  if (Math.abs(delta) < UPRIGHT_MIN_CORRECTION) return;
  body.setAngvel({ x: av.x + _wax.x * delta, y: av.y + _wax.y * delta, z: av.z + _wax.z * delta }, true);
}

/** Tuning ao vivo de suspensão/grip, por roda. Só mexe nos campos informados. */
export interface WheelTuning {
  suspensionStiffness?: number;
  suspensionRestLength?: number;
  suspensionCompression?: number;
  suspensionRelaxation?: number;
  maxSuspensionTravel?: number;
  frictionSlip?: number;
}

export function applyWheelTuning(ctrl: Controller, gripScales: readonly (number | undefined)[], t: WheelTuning): void {
  for (let i = 0; i < gripScales.length; i++) {
    if (t.suspensionStiffness != null) ctrl.setWheelSuspensionStiffness(i, t.suspensionStiffness);
    if (t.suspensionRestLength != null) ctrl.setWheelSuspensionRestLength(i, t.suspensionRestLength);
    if (t.suspensionCompression != null) ctrl.setWheelSuspensionCompression(i, t.suspensionCompression);
    if (t.suspensionRelaxation != null) ctrl.setWheelSuspensionRelaxation(i, t.suspensionRelaxation);
    if (t.maxSuspensionTravel != null) ctrl.setWheelMaxSuspensionTravel(i, t.maxSuspensionTravel);
    if (t.frictionSlip != null) ctrl.setWheelFrictionSlip(i, t.frictionSlip * (gripScales[i] ?? 1));
  }
}
