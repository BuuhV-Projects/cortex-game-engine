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
RigidBody.prototype.wakeUp = function () {
  __rapierNative.bodySet(this.__world, this.handle, 7, 0, 0, 0, 0, 1);
};

function World(gravity) {
  this.__ptr = __rapierNative.worldNew(gravity.x, gravity.y, gravity.z);
  this.__scratch = new Float64Array(__rapierNative.worldScratch(this.__ptr));
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
  return new RigidBody(this.__ptr, this.__scratch, handle);
};
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
World.prototype.createVehicleController = function () {
  throw new Error(
    'CortexNative: DynamicRayCastVehicleController ainda não portado (pendência M1 — ver m1-inventario-teste4.md)',
  );
};

const RAPIER = {
  init: function () { return Promise.resolve(); },
  World: World,
  RigidBodyDesc: RigidBodyDesc,
  ColliderDesc: ColliderDesc,
};

export default RAPIER;
export { World, RigidBodyDesc, ColliderDesc };
