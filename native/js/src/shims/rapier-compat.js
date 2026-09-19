// Adaptador @dimforge/rapier3d-compat → Rapier NATIVO (__rapierNative).
// O bundle.mjs aponta o import do compat pra cá; o engine (RapierPhysics.ts)
// não sabe que trocou de implementação. Cobre a superfície que o engine usa;
// veículo (DynamicRayCastVehicleController) é pendência documentada no M1.

const KIND = { dynamic: 0, fixed: 1, kinematicPositionBased: 2 };
const SHAPE = { cuboid: 0, ball: 1, capsule: 2 };

function RigidBodyDesc(kind) {
  this.kind = kind;
  this.x = 0; this.y = 0; this.z = 0;
  this.canSleep = true;
}
RigidBodyDesc.prototype.setTranslation = function (x, y, z) {
  this.x = x; this.y = y; this.z = z;
  return this;
};
RigidBodyDesc.prototype.setCanSleep = function (value) {
  this.canSleep = value;
  return this;
};
RigidBodyDesc.dynamic = function () { return new RigidBodyDesc(KIND.dynamic); };
RigidBodyDesc.fixed = function () { return new RigidBodyDesc(KIND.fixed); };
RigidBodyDesc.kinematicPositionBased = function () {
  return new RigidBodyDesc(KIND.kinematicPositionBased);
};

function ColliderDesc(shape, a, b, c) {
  this.shape = shape;
  this.a = a || 0; this.b = b || 0; this.c = c || 0;
  this.friction = -1; this.restitution = -1;
  this.sensor = false;
  this.massMode = 0; this.massValue = 0;
  this.ox = 0; this.oy = 0; this.oz = 0;
  this.trimeshVerts = null; this.trimeshIndices = null;
}
ColliderDesc.prototype.setFriction = function (v) { this.friction = v; return this; };
ColliderDesc.prototype.setRestitution = function (v) { this.restitution = v; return this; };
ColliderDesc.prototype.setSensor = function (v) { this.sensor = !!v; return this; };
ColliderDesc.prototype.setDensity = function (v) { this.massMode = 1; this.massValue = v; return this; };
ColliderDesc.prototype.setMass = function (v) { this.massMode = 2; this.massValue = v; return this; };
ColliderDesc.prototype.setTranslation = function (x, y, z) {
  this.ox = x; this.oy = y; this.oz = z;
  return this;
};
ColliderDesc.cuboid = function (hx, hy, hz) { return new ColliderDesc(SHAPE.cuboid, hx, hy, hz); };
ColliderDesc.ball = function (r) { return new ColliderDesc(SHAPE.ball, r); };
ColliderDesc.capsule = function (halfHeight, radius) {
  return new ColliderDesc(SHAPE.capsule, halfHeight, radius);
};
ColliderDesc.trimesh = function (vertices, indices) {
  const desc = new ColliderDesc(-1);
  desc.trimeshVerts = vertices;
  desc.trimeshIndices = indices;
  return desc;
};

function RigidBody(worldPtr, scratch, handle) {
  this.__world = worldPtr;
  this.__scratch = scratch;
  this.handle = handle;
}
RigidBody.prototype.__vec3 = function (what) {
  __rapierNative.bodyGet(this.__world, this.handle, what);
  const s = this.__scratch;
  return { x: s[0], y: s[1], z: s[2] };
};
RigidBody.prototype.translation = function () { return this.__vec3(0); };
RigidBody.prototype.linvel = function () { return this.__vec3(2); };
RigidBody.prototype.angvel = function () { return this.__vec3(3); };
RigidBody.prototype.rotation = function () {
  __rapierNative.bodyGet(this.__world, this.handle, 1);
  const s = this.__scratch;
  return { x: s[0], y: s[1], z: s[2], w: s[3] };
};
RigidBody.prototype.setTranslation = function (p, wake) {
  __rapierNative.bodySet(this.__world, this.handle, 0, p.x, p.y, p.z, 0, wake === false ? 0 : 1);
};
RigidBody.prototype.setRotation = function (q, wake) {
  __rapierNative.bodySet(this.__world, this.handle, 1, q.x, q.y, q.z, q.w, wake === false ? 0 : 1);
};
RigidBody.prototype.setLinvel = function (v, wake) {
  __rapierNative.bodySet(this.__world, this.handle, 2, v.x, v.y, v.z, 0, wake === false ? 0 : 1);
};
RigidBody.prototype.setAngvel = function (v, wake) {
  __rapierNative.bodySet(this.__world, this.handle, 3, v.x, v.y, v.z, 0, wake === false ? 0 : 1);
};
RigidBody.prototype.setNextKinematicTranslation = function (p) {
  __rapierNative.bodySet(this.__world, this.handle, 4, p.x, p.y, p.z, 0, 1);
};
RigidBody.prototype.applyImpulse = function (v, wake) {
  __rapierNative.bodySet(this.__world, this.handle, 5, v.x, v.y, v.z, 0, wake === false ? 0 : 1);
};
RigidBody.prototype.applyTorqueImpulse = function (v, wake) {
  __rapierNative.bodySet(this.__world, this.handle, 6, v.x, v.y, v.z, 0, wake === false ? 0 : 1);
};
// Massa/CM/inercia EXPLICITOS (SPEC-0209): o veiculo usa pra baixar o centro de
// massa e afrouxar a inercia de guinada. O `frame` da API do Rapier e ignorado
// aqui — o engine sempre passa identidade.
RigidBody.prototype.setAdditionalMassProperties = function (mass, com, inertia, _frame, wake) {
  __rapierNative.bodyMassProps(
    this.__world, this.handle, mass,
    com.x, com.y, com.z,
    inertia.x, inertia.y, inertia.z,
    wake === false ? 0 : 1,
  );
};
// Tipo do corpo. O jogo usa pra achar o chassi entre os corpos que o veiculo
// criou (`forEachRigidBody` + `isDynamic`).
RigidBody.prototype.__bodyType = function () {
  __rapierNative.bodyGet(this.__world, this.handle, 4);
  return this.__scratch[0];
};
RigidBody.prototype.isDynamic = function () { return this.__bodyType() === 0; };
RigidBody.prototype.isFixed = function () { return this.__bodyType() === 1; };
RigidBody.prototype.isKinematic = function () { return this.__bodyType() === 2; };

RigidBody.prototype.numColliders = function () {
  __rapierNative.bodyGet(this.__world, this.handle, 5);
  return this.__scratch[0];
};
RigidBody.prototype.collider = function (index) {
  const handle = __rapierNative.bodyCollider(this.__world, this.handle, index);
  return handle < 0 ? null : new Collider(this.__world, handle);
};

RigidBody.prototype.resetForces = function (wake) {
  __rapierNative.bodySet(this.__world, this.handle, 8, 0, 0, 0, 0, wake === false ? 0 : 1);
};
RigidBody.prototype.resetTorques = function (wake) {
  __rapierNative.bodySet(this.__world, this.handle, 9, 0, 0, 0, 0, wake === false ? 0 : 1);
};
// Trava eixos de rotacao (o carro so gira em Y) — booleanos viram 0/1.
RigidBody.prototype.setEnabledRotations = function (x, y, z, wake) {
  __rapierNative.bodySet(
    this.__world, this.handle, 10, x ? 1 : 0, y ? 1 : 0, z ? 1 : 0, 0,
    wake === false ? 0 : 1,
  );
};

/**
 * Collider vivo do mundo. So o que o engine/jogo usam: identidade e grupos de
 * colisao (o kart-racer liga/desliga colisao entre carros no respawn).
 */
function Collider(worldPtr, handle) {
  this.__world = worldPtr;
  this.handle = handle;
}
Collider.prototype.collisionGroups = function () {
  return __rapierNative.colliderGroups(this.__world, this.handle, 0, 0);
};
Collider.prototype.setCollisionGroups = function (groups) {
  __rapierNative.colliderGroups(this.__world, this.handle, 1, groups);
};

RigidBody.prototype.wakeUp = function () {
  __rapierNative.bodySet(this.__world, this.handle, 7, 0, 0, 0, 0, 1);
};

function World(gravity) {
  this.__ptr = __rapierNative.worldNew(gravity.x, gravity.y, gravity.z);
  this.__scratch = new Float64Array(__rapierNative.worldScratch(this.__ptr));
  // Corpos criados por este mundo, na ordem de criacao — e o que sustenta o
  // `forEachRigidBody` (SPEC-0208). O Rapier do browser itera a arena interna;
  // aqui a arena vive no Rust, entao guardamos os wrappers que entregamos.
  this.__bodies = [];
  // Controllers de veiculo criados por este mundo (ver `vehicleControllers`).
  this.__vehicles = [];
}
World.prototype.step = function () {
  __rapierNative.worldStep(this.__ptr);
};
World.prototype.free = function () {
  __rapierNative.worldFree(this.__ptr);
  this.__ptr = 0;
};
World.prototype.createRigidBody = function (desc) {
  const handle = __rapierNative.bodyCreate(
    this.__ptr, desc.kind, desc.x, desc.y, desc.z, desc.canSleep ? 1 : 0,
  );
  const body = new RigidBody(this.__ptr, this.__scratch, handle);
  this.__bodies.push(body);
  return body;
};

// Itera os corpos do mundo, como o Rapier do browser. Jogos usam isto pra
// descobrir o que foi criado por um helper (o kart-racer compara o antes e o
// depois do createVehicle). Sem isto, `undefined is not a function` no meio do
// setup — erro que nao diz nada sobre a causa (SPEC-0208).
World.prototype.forEachRigidBody = function (callback) {
  if (typeof callback !== 'function') return;
  // Copia: o callback pode criar corpos (e mexer no array durante a iteracao).
  const snapshot = this.__bodies.slice();
  for (let i = 0; i < snapshot.length; i++) callback(snapshot[i]);
};

/** Quantos corpos este mundo criou. Espelha `world.bodies.len()` do Rapier. */
Object.defineProperty(World.prototype, 'numRigidBodies', {
  get: function () { return this.__bodies.length; },
});
World.prototype.createCollider = function (desc, body) {
  if (desc.trimeshVerts) {
    return __rapierNative.colliderTrimesh(
      this.__ptr, body.handle, desc.trimeshVerts, desc.trimeshIndices,
    );
  }
  return __rapierNative.colliderShape(
    this.__ptr, body.handle, desc.shape, desc.a, desc.b, desc.c,
    desc.friction, desc.restitution, desc.sensor ? 1 : 0,
    desc.massMode, desc.massValue, desc.ox, desc.oy, desc.oz,
  );
};
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

function VehicleController(worldPtr, scratch, ptr, chassis) {
  this.__world = worldPtr;
  this.__scratch = scratch;
  this.__ptr = ptr;
  this.__chassis = chassis;
  this.__wheels = 0;
  this.__upAxis = 1;
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
};

VehicleController.prototype.numWheels = function () { return this.__wheels; };

VehicleController.prototype.__set = function (index, param, value) {
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
  __rapierNative.vehicleUpdate(
    this.__ptr, this.__world, dt,
    typeof groups === 'number' ? groups : -1,
  );
};

// Estado da roda: uma chamada nativa preenche o scratch, os getters leem dali.
VehicleController.prototype.__state = function (index) {
  __rapierNative.vehicleWheelState(this.__ptr, this.__world, index);
  return this.__scratch;
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

World.prototype.createVehicleController = function (chassis) {
  const ptr = __rapierNative.vehicleNew(this.__ptr, chassis.handle);
  if (!ptr) throw new Error('CortexNative: chassi invalido em createVehicleController');
  const ctrl = new VehicleController(this.__ptr, this.__scratch, ptr, chassis);
  this.__vehicles.push(ctrl);
  return ctrl;
};

// `world.vehicleControllers` e ITERAVEL no Rapier do browser (um Set nativo) —
// jogos varrem pra achar o controller de um chassi. Aqui e um array com
// Symbol.iterator, que e o que `[...world.vehicleControllers]` precisa.
Object.defineProperty(World.prototype, 'vehicleControllers', {
  get: function () {
    const list = this.__vehicles;
    return {
      length: list.length,
      [Symbol.iterator]: function () { return list[Symbol.iterator](); },
    };
  },
});

const RAPIER = {
  init: function () { return Promise.resolve(); },
  World: World,
  RigidBodyDesc: RigidBodyDesc,
  ColliderDesc: ColliderDesc,
  DynamicRayCastVehicleController: VehicleController,
};

export default RAPIER;
export { World, RigidBodyDesc, ColliderDesc, VehicleController, Collider };
