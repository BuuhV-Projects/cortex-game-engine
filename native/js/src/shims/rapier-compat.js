// Adaptador @dimforge/rapier3d-compat → Rapier NATIVO (__rapierNative).
// O bundle.mjs aponta o import do compat pra cá; o engine (RapierPhysics.ts)
// não sabe que trocou de implementação. Cobre a superfície que o engine usa;
// veículo (DynamicRayCastVehicleController) é pendência documentada no M1.
// Consultas e veículo moram em módulos próprios (SPEC-0671); este instala os dois no World.
import { castRayAndGetNormal, castRay, contactPairsWith, contactPair } from './rapier-compat-queries.js';
import { VehicleController, createVehicleController, vehicleControllersProperty } from './rapier-compat-vehicle.js';

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
  return handle < 0 ? null : new Collider(this.__world, handle, this.__scratch);
};

/**
 * Massa do corpo. O kart-racer dosa o impulso de frenagem da IA com ela
 * (`-missingBrake * body.mass()`) — sem isto, `undefined is not a function`
 * todo frame e o tick do jogo inteiro caía (SPEC-0216).
 */
RigidBody.prototype.mass = function () {
  __rapierNative.bodyGet(this.__world, this.handle, 6);
  return this.__scratch[0];
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
// rn_body_set codes 12..15 (SPEC-0394) — mirrored in rapier-native/src/lib.rs.
const BODY_SET_TYPE = 12;
const BODY_SET_CCD = 13;
const BODY_SET_LINEAR_DAMPING = 14;
const BODY_SET_ANGULAR_DAMPING = 15;
/** `type` uses rapier3d-compat's RigidBodyType numbering (Dynamic 0, Fixed 1, ...). */
RigidBody.prototype.setBodyType = function (type, wake) {
  __rapierNative.bodySet(this.__world, this.handle, BODY_SET_TYPE, type, 0, 0, 0, wake === false ? 0 : 1);
};
RigidBody.prototype.enableCcd = function (enabled) {
  __rapierNative.bodySet(this.__world, this.handle, BODY_SET_CCD, enabled ? 1 : 0, 0, 0, 0, 1);
};
RigidBody.prototype.setLinearDamping = function (factor) {
  __rapierNative.bodySet(this.__world, this.handle, BODY_SET_LINEAR_DAMPING, factor, 0, 0, 0, 1);
};
RigidBody.prototype.setAngularDamping = function (factor) {
  __rapierNative.bodySet(this.__world, this.handle, BODY_SET_ANGULAR_DAMPING, factor, 0, 0, 0, 1);
};

/**
 * Collider vivo do mundo. So o que o engine/jogo usam: identidade e grupos de
 * colisao (o kart-racer liga/desliga colisao entre carros no respawn).
 */
function Collider(worldPtr, handle, scratch) {
  this.__world = worldPtr;
  this.handle = handle;
  // O `parent()` devolve um RigidBody, que lê posição/rotação pelo scratch.
  this.__scratch = scratch;
}
Collider.prototype.collisionGroups = function () {
  return __rapierNative.colliderGroups(this.__world, this.handle, 0, 0);
};
Collider.prototype.setCollisionGroups = function (groups) {
  __rapierNative.colliderGroups(this.__world, this.handle, 1, groups);
};
/** É um sensor (atravessa, só reporta)? O que um `filterPredicate` pergunta. */
Collider.prototype.isSensor = function () {
  return __rapierNative.colliderGet(this.__world, this.handle, 0) === 1;
};
// rn_collider_set codes (SPEC-0394) — mirrored in rapier-native/src/lib.rs.
const COLLIDER_SET = { radius: 0, halfHeight: 1, density: 2, friction: 3, restitution: 4 };
/** Capsule or ball radius. */
Collider.prototype.setRadius = function (radius) {
  __rapierNative.colliderSet(this.__world, this.handle, COLLIDER_SET.radius, radius);
};
/** Half height of a Y capsule. */
Collider.prototype.setHalfHeight = function (halfHeight) {
  __rapierNative.colliderSet(this.__world, this.handle, COLLIDER_SET.halfHeight, halfHeight);
};
Collider.prototype.setDensity = function (density) {
  __rapierNative.colliderSet(this.__world, this.handle, COLLIDER_SET.density, density);
};
Collider.prototype.setFriction = function (friction) {
  __rapierNative.colliderSet(this.__world, this.handle, COLLIDER_SET.friction, friction);
};
Collider.prototype.setRestitution = function (restitution) {
  __rapierNative.colliderSet(this.__world, this.handle, COLLIDER_SET.restitution, restitution);
};
/** Corpo dono, ou `null`. O outro lado do `filterPredicate` (SPEC-0216). */
Collider.prototype.parent = function () {
  const handle = __rapierNative.colliderGet(this.__world, this.handle, 1);
  return handle < 0 ? null : new RigidBody(this.__world, this.__scratch, handle);
};

/**
 * Liga/desliga o corpo e todos os colliders dele (somem da simulação e do
 * raycast). Mesma assinatura do browser: sem `wakeUp`. O DDD 61 desliga os
 * troncos da mata por célula já no boot (SPEC-0314).
 */
RigidBody.prototype.setEnabled = function (enabled) {
  __rapierNative.bodySet(this.__world, this.handle, 11, enabled ? 1 : 0, 0, 0, 0, 1);
};
RigidBody.prototype.isEnabled = function () {
  __rapierNative.bodyGet(this.__world, this.handle, 7);
  return this.__scratch[0] !== 0;
};

/**
 * Dormindo? Mesmo significado do browser: dinâmico parado dorme; cinemático
 * NUNCA dorme no Rapier. Sem isto, uma sonda que perguntava `isSleeping?.()`
 * recebia `undefined` e contava todo corpo como acordado (SPEC-0337).
 */
RigidBody.prototype.isSleeping = function () {
  __rapierNative.bodyGet(this.__world, this.handle, 8);
  return this.__scratch[0] !== 0;
};

RigidBody.prototype.wakeUp = function () {
  __rapierNative.bodySet(this.__world, this.handle, 7, 0, 0, 0, 0, 1);
};

/** Põe o corpo para dormir (API do browser). O carro parado dorme (SPEC-0655). */
RigidBody.prototype.sleep = function () {
  __rapierNative.bodySet(this.__world, this.handle, 16, 0, 0, 0, 0, 0);
};

function World(gravity) {
  this.__ptr = __rapierNative.worldNew(gravity.x, gravity.y, gravity.z);
  // O Rapier do browser expõe a gravidade como propriedade, e jogos LEEM dela
  // (o kart-racer cancela a gravidade ao longo da pista todo frame). Sem isto,
  // `copy(world.gravity)` vira "Cannot read property 'x' of undefined".
  this.gravity = { x: gravity.x, y: gravity.y, z: gravity.z };
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
// `world.timestep` do Rapier do browser (ADR-0257). Sem isto, atribuir criava
// uma propriedade JS solta: nenhum erro, e o passo nativo seguia em 1/60 — o
// passo semi-fixo do engine (`RapierPhysics.advance`) virava no-op SO no export.
Object.defineProperty(World.prototype, 'timestep', {
  get() {
    return __rapierNative.worldTimestep(this.__ptr);
  },
  set(dt) {
    __rapierNative.worldSetTimestep(this.__ptr, dt);
  },
});
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

World.prototype.__collider = function (handle) {
  return new Collider(this.__ptr, handle, this.__scratch);
};
Object.assign(World.prototype, { castRayAndGetNormal, castRay, contactPairsWith, contactPair });
/**
 * Corpo pelo handle, ou `null`. O Rapier do browser resolve na arena interna;
 * aqui a arena vive no Rust, então procuramos entre os wrappers entregues —
 * é a mesma lista que sustenta o `forEachRigidBody` (SPEC-0208).
 */
World.prototype.getRigidBody = function (handle) {
  for (let i = 0; i < this.__bodies.length; i++) {
    if (this.__bodies[i].handle === handle) return this.__bodies[i];
  }
  return null;
};

/**
 * Remove o corpo do mundo. O kart-racer usa no respawn, pra limpar os corpos
 * que sobraram do carro anterior.
 */
World.prototype.removeRigidBody = function (body) {
  if (!body) return;
  __rapierNative.bodyRemove(this.__ptr, body.handle);
  const i = this.__bodies.indexOf(body);
  if (i >= 0) this.__bodies.splice(i, 1);
};


// `world.bodies` — o RigidBodySet do Rapier do browser (SPEC-0313): o DDD 61
// itera `world.bodies.forEach` pra achar os corpos que um helper acabou de
// criar. Subset: forEach, len, get, getAll — sobre os wrappers deste mundo.
Object.defineProperty(World.prototype, 'bodies', {
  get: function () {
    const world = this;
    return {
      forEach: function (callback) { world.forEachRigidBody(callback); },
      len: function () { return world.__bodies.length; },
      get: function (handle) { return world.getRigidBody(handle); },
      getAll: function () { return world.__bodies.slice(); },
    };
  },
});

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
World.prototype.createVehicleController = createVehicleController;
Object.defineProperty(World.prototype, 'vehicleControllers', vehicleControllersProperty);

const RAPIER = {
  init: function () { return Promise.resolve(); },
  World: World,
  RigidBodyDesc: RigidBodyDesc,
  ColliderDesc: ColliderDesc,
  DynamicRayCastVehicleController: VehicleController,
};

export default RAPIER;
export { World, RigidBodyDesc, ColliderDesc, VehicleController, Collider };
