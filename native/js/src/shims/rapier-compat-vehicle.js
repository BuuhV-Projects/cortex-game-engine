// ─── Veiculo raycast (SPEC-0209) ──────────────────────────────────────────
//
// Reconstroi a FORMA do DynamicRayCastVehicleController do Rapier do browser,
// pra o engine (src/physics/RapierPhysics.ts) nao saber a diferenca. O estado
// vetorial vem pelo scratch do mundo, como no RigidBody.

/** Codigos de parametro de roda — espelham as constantes WHEEL_* do lib.rs. */
const WHEEL = {
  suspensionStiffness: 0,
  dampingCompression: 1,
  dampingRelaxation: 2,
  maxSuspensionTravel: 3,
  frictionSlip: 4,
  suspensionRestLength: 5,
  engineForce: 6,
  brake: 7,
  steering: 8,
};

export function VehicleController(worldPtr, scratch, ptr, chassis) {
  this.__world = worldPtr;
  this.__scratch = scratch;
  this.__ptr = ptr;
  this.__chassis = chassis;
  this.__wheels = 0;
  // Descrição de cada roda como o JOGO lê (`vehicle.wheels[i].position`): o
  // Rapier do browser expõe isso, e o `followGround` do carro usa pra saber de
  // onde sai o raio de cada roda (SPEC-0216).
  this.__wheelData = [];
  this.__upAxis = 1;
  // Estado lido de cada roda + a geração em que foi lido (ver `__state`).
  this.__wheelState = [];
  this.__generation = 0;
}

/** O corpo do chassi — jogos comparam `chassis().handle` pra achar o seu. */
VehicleController.prototype.chassis = function () { return this.__chassis; };

// `indexUpAxis` e PROPRIEDADE no Rapier (o engine faz `ctrl.indexUpAxis = 1`),
// entao aqui tambem — o setter repassa pro nativo.
Object.defineProperty(VehicleController.prototype, 'indexUpAxis', {
  get: function () { return this.__upAxis; },
  set: function (axis) {
    this.__upAxis = axis;
    __rapierNative.vehicleSetUpAxis(this.__ptr, axis);
  },
});

VehicleController.prototype.addWheel = function (position, direction, axle, restLength, radius) {
  __rapierNative.vehicleAddWheel(
    this.__ptr,
    position.x, position.y, position.z,
    direction.x, direction.y, direction.z,
    axle.x, axle.y, axle.z,
    restLength, radius,
  );
  this.__wheels++;
  // Cópia por valor: o chamador reusa o mesmo vetor entre as rodas.
  this.__wheelData.push({
    position: { x: position.x, y: position.y, z: position.z },
    direction: { x: direction.x, y: direction.y, z: direction.z },
    axle: { x: axle.x, y: axle.y, z: axle.z },
    suspensionRestLength: restLength,
    radius,
  });
};

VehicleController.prototype.numWheels = function () { return this.__wheels; };

/** Nº de rodas como PROPRIEDADE (o jogo faz `for (i < vehicle.wheelCount)`). */
Object.defineProperty(VehicleController.prototype, 'wheelCount', {
  get: function () { return this.__wheels; },
});

/** As rodas como o Rapier do browser expõe: `wheels[i].position`/`.radius`. */
Object.defineProperty(VehicleController.prototype, 'wheels', {
  get: function () { return this.__wheelData; },
});

VehicleController.prototype.__set = function (index, param, value) {
  this.__generation++; // esterço/comprimento mudam o estado da roda
  __rapierNative.vehicleSetWheel(this.__ptr, index, param, value);
};
VehicleController.prototype.setWheelSuspensionStiffness = function (i, v) { this.__set(i, WHEEL.suspensionStiffness, v); };
VehicleController.prototype.setWheelSuspensionCompression = function (i, v) { this.__set(i, WHEEL.dampingCompression, v); };
VehicleController.prototype.setWheelSuspensionRelaxation = function (i, v) { this.__set(i, WHEEL.dampingRelaxation, v); };
VehicleController.prototype.setWheelMaxSuspensionTravel = function (i, v) { this.__set(i, WHEEL.maxSuspensionTravel, v); };
VehicleController.prototype.setWheelFrictionSlip = function (i, v) { this.__set(i, WHEEL.frictionSlip, v); };
VehicleController.prototype.setWheelSuspensionRestLength = function (i, v) { this.__set(i, WHEEL.suspensionRestLength, v); };
VehicleController.prototype.setWheelEngineForce = function (i, v) { this.__set(i, WHEEL.engineForce, v); };
VehicleController.prototype.setWheelBrake = function (i, v) { this.__set(i, WHEEL.brake, v); };
VehicleController.prototype.setWheelSteering = function (i, v) { this.__set(i, WHEEL.steering, v); };

/**
 * Integra o veiculo. A assinatura completa do Rapier e
 * `(dt, filterFlags, filterGroups, filterPredicate)`; aqui os GRUPOS sao
 * repassados ao filtro nativo e o **predicate e ignorado** — ele exigiria
 * chamar JS de dentro do Rust a cada collider candidato, por roda, por frame
 * (ver SPEC-0209, "o que falta"). O aviso sai UMA vez, senao inundaria o log.
 */
VehicleController.prototype.updateVehicle = function (dt, _flags, groups, predicate) {
  if (predicate && !VehicleController.__warnedPredicate) {
    VehicleController.__warnedPredicate = true;
    console.warn(
      '[cortex] filtro por callback do raycast das rodas ainda nao roda no host ' +
      '(SPEC-0209): as rodas enxergam todos os colliders permitidos pelos grupos.',
    );
  }
  this.__generation++;
  __rapierNative.vehicleUpdate(
    this.__ptr, this.__world, dt,
    typeof groups === 'number' ? groups : -1,
  );
};

/** Campos do estado da roda no scratch: contato, ponto (3), conexão (3), suspensão, esterço, rotação. */
const WHEEL_STATE_SIZE = 10;

/**
 * Estado da roda: uma chamada nativa preenche o scratch e o shim guarda uma
 * cópia por roda, válida até a próxima `updateVehicle` ou setter de roda — os
 * únicos pontos em que o Rapier muda esse estado (SPEC-0671). Sem a cópia, o
 * `wheelLocalTransform` do engine fazia 3 chamadas nativas por roda por quadro
 * (conexão, suspensão, esterço) para ler o mesmo estado.
 */
VehicleController.prototype.__state = function (index) {
  let cached = this.__wheelState[index];
  if (cached && cached.generation === this.__generation) return cached.values;
  if (!cached) cached = this.__wheelState[index] = { generation: -1, values: new Float64Array(WHEEL_STATE_SIZE) };
  __rapierNative.vehicleWheelState(this.__ptr, this.__world, index);
  cached.values.set(this.__scratch.subarray(0, WHEEL_STATE_SIZE));
  cached.generation = this.__generation;
  return cached.values;
};
VehicleController.prototype.wheelIsInContact = function (i) { return this.__state(i)[0] !== 0; };
VehicleController.prototype.wheelContactPoint = function (i) {
  const s = this.__state(i);
  // O Rapier devolve `null` quando a roda esta no ar — o engine checa isso.
  if (s[0] === 0) return null;
  return { x: s[1], y: s[2], z: s[3] };
};
VehicleController.prototype.wheelChassisConnectionPointCs = function (i) {
  const s = this.__state(i);
  return { x: s[4], y: s[5], z: s[6] };
};
VehicleController.prototype.wheelSuspensionLength = function (i) { return this.__state(i)[7]; };
VehicleController.prototype.wheelSteering = function (i) { return this.__state(i)[8]; };
VehicleController.prototype.wheelRotation = function (i) { return this.__state(i)[9]; };

export function createVehicleController(chassis) {
  const ptr = __rapierNative.vehicleNew(this.__ptr, chassis.handle);
  if (!ptr) throw new Error('CortexNative: chassi invalido em createVehicleController');
  const ctrl = new VehicleController(this.__ptr, this.__scratch, ptr, chassis);
  this.__vehicles.push(ctrl);
  return ctrl;
};

// `world.vehicleControllers` e ITERAVEL no Rapier do browser (um Set nativo) —
// jogos varrem pra achar o controller de um chassi. Aqui e um array com
// Symbol.iterator, que e o que `[...world.vehicleControllers]` precisa.
export const vehicleControllersProperty = {
  get: function () {
    const list = this.__vehicles;
    return {
      length: list.length,
      [Symbol.iterator]: function () { return list[Symbol.iterator](); },
    };
  },
};
