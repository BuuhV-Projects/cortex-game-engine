/**
 * Veículo raycast no shim do Rapier nativo (SPEC-0209). O engine
 * (`RapierPhysics.createVehicle`) fala com o `DynamicRayCastVehicleController`
 * do Rapier; aqui a forma dessa API é reconstruída sobre a ponte C.
 *
 * O que estes testes protegem é o CONTRATO entre as pontas: os códigos de
 * parâmetro de roda (espelhados em `lib.rs`) e o layout do scratch. Errar um
 * índice não quebra nada visível — o carro só dirige estranho.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../../native/js/src/shims/rapier-compat.js';

interface NativeBridge { __rapierNative?: Record<string, unknown> }
const g = globalThis as NativeBridge;

/** Chamadas que o lado nativo recebeu, para conferir o contrato. */
let calls: { fn: string; args: number[] }[];
/** Valores que o "nativo" escreve no scratch em `vehicleWheelState`. */
let wheelState: number[];

function installNativeRapier(): void {
  calls = [];
  wheelState = [1, 10, 20, 30, 1, 2, 3, 0.25, 0.5, 7];
  const scratch = new Float64Array(32);
  const record = (fn: string) => (...args: number[]) => { calls.push({ fn, args }); return 1; };
  g.__rapierNative = {
    worldNew: () => 1,
    worldScratch: () => scratch.buffer,
    bodyCreate: () => 42,
    vehicleNew: (...args: number[]) => { calls.push({ fn: 'vehicleNew', args }); return 99; },
    vehicleFree: record('vehicleFree'),
    vehicleSetUpAxis: record('vehicleSetUpAxis'),
    vehicleAddWheel: record('vehicleAddWheel'),
    vehicleSetWheel: record('vehicleSetWheel'),
    vehicleUpdate: record('vehicleUpdate'),
    vehicleWheelState: (...args: number[]) => {
      calls.push({ fn: 'vehicleWheelState', args });
      // O nativo escreve no scratch DO MUNDO — o shim lê de lá.
      const s = new Float64Array(scratch.buffer);
      wheelState.forEach((v, i) => { s[i] = v; });
      return 1;
    },
  };
}

/** Veículo pronto, com uma roda. */
function vehicleWithWheel() {
  const world = new World({ x: 0, y: -9.81, z: 0 });
  const chassis = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: false });
  const ctrl = world.createVehicleController(chassis);
  ctrl.addWheel({ x: 1, y: -0.3, z: 1.2 }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.3, 0.35);
  return ctrl;
}

const argsOf = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);

beforeEach(() => installNativeRapier());
afterEach(() => { delete g.__rapierNative; });

describe('createVehicleController', () => {
  it('não lança mais — o controlador existe no host (SPEC-0208 → 0209)', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    const chassis = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: false });
    expect(() => world.createVehicleController(chassis)).not.toThrow();
  });

  it('recusa um chassi que o nativo rejeitou (ponteiro nulo)', () => {
    g.__rapierNative!['vehicleNew'] = () => 0;
    const world = new World({ x: 0, y: 0, z: 0 });
    const chassis = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: false });
    expect(() => world.createVehicleController(chassis)).toThrow(/chassi invalido/i);
  });
});

describe('montagem do veículo', () => {
  it('indexUpAxis é PROPRIEDADE (o engine atribui) e chega ao nativo', () => {
    const ctrl = vehicleWithWheel();
    ctrl.indexUpAxis = 1;
    expect(argsOf('vehicleSetUpAxis')[0]).toEqual([99, 1]);
    expect(ctrl.indexUpAxis).toBe(1);
  });

  it('addWheel repassa posição, direção, eixo, comprimento e raio na ordem', () => {
    vehicleWithWheel();
    expect(argsOf('vehicleAddWheel')[0]).toEqual([99, 1, -0.3, 1.2, 0, -1, 0, -1, 0, 0, 0.3, 0.35]);
  });
});

describe('parâmetros de roda (contrato com o lib.rs)', () => {
  it('cada setter manda o código certo', () => {
    const ctrl = vehicleWithWheel();
    ctrl.setWheelSuspensionStiffness(0, 24);
    ctrl.setWheelSuspensionCompression(0, 0.82);
    ctrl.setWheelSuspensionRelaxation(0, 0.88);
    ctrl.setWheelMaxSuspensionTravel(0, 0.3);
    ctrl.setWheelFrictionSlip(0, 2.5);
    ctrl.setWheelSuspensionRestLength(0, 0.35);
    ctrl.setWheelEngineForce(0, 500);
    ctrl.setWheelBrake(0, 12);
    ctrl.setWheelSteering(0, 0.4);

    // [ptr, indice, CODIGO, valor] — os códigos são o contrato com o Rust.
    expect(argsOf('vehicleSetWheel')).toEqual([
      [99, 0, 0, 24], [99, 0, 1, 0.82], [99, 0, 2, 0.88], [99, 0, 3, 0.3],
      [99, 0, 4, 2.5], [99, 0, 5, 0.35], [99, 0, 6, 500], [99, 0, 7, 12],
      [99, 0, 8, 0.4],
    ]);
  });
});

describe('estado da roda (layout do scratch)', () => {
  it('lê contato, ponto de contato, conexão, suspensão, esterço e rotação', () => {
    const ctrl = vehicleWithWheel();

    expect(ctrl.wheelIsInContact(0)).toBe(true);
    expect(ctrl.wheelContactPoint(0)).toEqual({ x: 10, y: 20, z: 30 });
    expect(ctrl.wheelChassisConnectionPointCs(0)).toEqual({ x: 1, y: 2, z: 3 });
    expect(ctrl.wheelSuspensionLength(0)).toBe(0.25);
    expect(ctrl.wheelSteering(0)).toBe(0.5);
    expect(ctrl.wheelRotation(0)).toBe(7);
  });

  it('roda no ar devolve contato nulo (o engine checa `null`)', () => {
    const ctrl = vehicleWithWheel();
    wheelState = [0, 0, 0, 0, 1, 2, 3, 0.3, 0, 0];

    expect(ctrl.wheelIsInContact(0)).toBe(false);
    expect(ctrl.wheelContactPoint(0)).toBeNull();
  });
});

describe('updateVehicle', () => {
  it('passa veículo, mundo, dt e grupos — nessa ordem', () => {
    const ctrl = vehicleWithWheel();
    ctrl.updateVehicle(1 / 60);
    // -1 = sem filtro de grupo (o default do engine).
    expect(argsOf('vehicleUpdate')[0]).toEqual([99, 1, 1 / 60, -1]);
  });

  it('repassa os grupos de colisão quando o jogo os informa', () => {
    const ctrl = vehicleWithWheel();
    const groups = (2 << 16) | 0xfffd;
    ctrl.updateVehicle(1 / 60, 0, groups);
    expect(argsOf('vehicleUpdate')[0]).toEqual([99, 1, 1 / 60, groups]);
  });

  it('aceita a assinatura completa do Rapier sem quebrar (predicate ignorado)', () => {
    const ctrl = vehicleWithWheel();
    // O jogo troca `updateVehicle` por uma versão que passa um predicate de
    // filtro do raycast. O host ainda não o executa (SPEC-0209), mas aceitar a
    // chamada é o que mantém o jogo de pé.
    expect(() => ctrl.updateVehicle(1 / 60, 0, undefined, () => true)).not.toThrow();
    expect(argsOf('vehicleUpdate')).toHaveLength(1);
  });
});

describe('vehicleControllers do mundo', () => {
  it('é iterável e traz o controller criado (o jogo faz [...controllers])', () => {
    const world = new World({ x: 0, y: -9.81, z: 0 });
    const chassis = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: false });
    const ctrl = world.createVehicleController(chassis);

    expect([...world.vehicleControllers]).toEqual([ctrl]);
  });

  it('chassis() devolve o corpo usado na criação (o jogo compara handles)', () => {
    const world = new World({ x: 0, y: 0, z: 0 });
    const chassis = world.createRigidBody({ kind: 0, x: 0, y: 0, z: 0, canSleep: false });
    const ctrl = world.createVehicleController(chassis);

    expect(ctrl.chassis()).toBe(chassis);
    expect(ctrl.chassis().handle).toBe(chassis.handle);
  });
});
