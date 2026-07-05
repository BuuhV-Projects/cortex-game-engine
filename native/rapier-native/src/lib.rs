//! C ABI do Rapier pro host CortexNative.
//!
//! Desenho: superfície MÍNIMA e achatada (ponteiros/f64), espelhando só o
//! que o engine usa (src/physics/RapierPhysics.ts). Resultados vetoriais
//! saem pelo `scratch` (16 f64 por mundo) que o C++ expõe ao JS como
//! Float64Array externo — zero marshaling por chamada.
//! Handles de corpo: (index, generation) do Rapier empacotados num f64
//! (index + generation·2^32 — cabe sem perda até 2^53).

use rapier3d::prelude::*;

pub struct World {
    gravity: Vector<Real>,
    integration_parameters: IntegrationParameters,
    physics_pipeline: PhysicsPipeline,
    islands: IslandManager,
    broad_phase: DefaultBroadPhase,
    narrow_phase: NarrowPhase,
    bodies: RigidBodySet,
    colliders: ColliderSet,
    impulse_joints: ImpulseJointSet,
    multibody_joints: MultibodyJointSet,
    ccd_solver: CCDSolver,
    query_pipeline: QueryPipeline,
    scratch: [f64; 16],
}

fn pack_handle(handle: RigidBodyHandle) -> f64 {
    let (index, generation) = handle.into_raw_parts();
    (index as u64 + ((generation as u64) << 32)) as f64
}

fn unpack_handle(packed: f64) -> RigidBodyHandle {
    let raw = packed as u64;
    RigidBodyHandle::from_raw_parts(raw as u32, (raw >> 32) as u32)
}

#[no_mangle]
pub extern "C" fn rn_world_new(gx: f64, gy: f64, gz: f64) -> *mut World {
    Box::into_raw(Box::new(World {
        gravity: vector![gx as f32, gy as f32, gz as f32],
        integration_parameters: IntegrationParameters::default(),
        physics_pipeline: PhysicsPipeline::new(),
        islands: IslandManager::new(),
        broad_phase: DefaultBroadPhase::new(),
        narrow_phase: NarrowPhase::new(),
        bodies: RigidBodySet::new(),
        colliders: ColliderSet::new(),
        impulse_joints: ImpulseJointSet::new(),
        multibody_joints: MultibodyJointSet::new(),
        ccd_solver: CCDSolver::new(),
        query_pipeline: QueryPipeline::new(),
        scratch: [0.0; 16],
    }))
}

/// # Safety: `world` deve vir de rn_world_new e não ter sido liberado.
#[no_mangle]
pub unsafe extern "C" fn rn_world_free(world: *mut World) {
    if !world.is_null() {
        drop(Box::from_raw(world));
    }
}

#[no_mangle]
pub unsafe extern "C" fn rn_world_scratch(world: *mut World) -> *mut f64 {
    (*world).scratch.as_mut_ptr()
}

#[no_mangle]
pub unsafe extern "C" fn rn_world_step(world: *mut World) {
    let w = &mut *world;
    w.physics_pipeline.step(
        &w.gravity,
        &w.integration_parameters,
        &mut w.islands,
        &mut w.broad_phase,
        &mut w.narrow_phase,
        &mut w.bodies,
        &mut w.colliders,
        &mut w.impulse_joints,
        &mut w.multibody_joints,
        &mut w.ccd_solver,
        Some(&mut w.query_pipeline),
        &(),
        &(),
    );
}

/// kind: 0 = dynamic, 1 = fixed, 2 = kinematicPositionBased
#[no_mangle]
pub unsafe extern "C" fn rn_body_create(
    world: *mut World,
    kind: f64,
    x: f64,
    y: f64,
    z: f64,
    can_sleep: f64,
) -> f64 {
    let w = &mut *world;
    let mut builder = match kind as i32 {
        1 => RigidBodyBuilder::fixed(),
        2 => RigidBodyBuilder::kinematic_position_based(),
        _ => RigidBodyBuilder::dynamic(),
    };
    builder = builder
        .translation(vector![x as f32, y as f32, z as f32])
        .can_sleep(can_sleep != 0.0);
    pack_handle(w.bodies.insert(builder))
}

/// shape_kind: 0 = cuboid(a,b,c) · 1 = ball(a) · 2 = capsule(halfHeight=a, r=b)
/// mass_mode: 0 = default · 1 = density(valor) · 2 = mass(valor)
#[no_mangle]
pub unsafe extern "C" fn rn_collider_shape(
    world: *mut World,
    body: f64,
    shape_kind: f64,
    a: f64,
    b: f64,
    c: f64,
    friction: f64,
    restitution: f64,
    sensor: f64,
    mass_mode: f64,
    mass_value: f64,
    ox: f64,
    oy: f64,
    oz: f64,
) -> f64 {
    let w = &mut *world;
    let mut builder = match shape_kind as i32 {
        1 => ColliderBuilder::ball(a as f32),
        2 => ColliderBuilder::capsule_y(a as f32, b as f32),
        _ => ColliderBuilder::cuboid(a as f32, b as f32, c as f32),
    };
    if friction >= 0.0 {
        builder = builder.friction(friction as f32);
    }
    if restitution >= 0.0 {
        builder = builder.restitution(restitution as f32);
    }
    if sensor != 0.0 {
        builder = builder.sensor(true);
    }
    match mass_mode as i32 {
        1 => builder = builder.density(mass_value as f32),
        2 => builder = builder.mass(mass_value as f32),
        _ => {}
    }
    builder = builder.translation(vector![ox as f32, oy as f32, oz as f32]);
    let handle =
        w.colliders
            .insert_with_parent(builder, unpack_handle(body), &mut w.bodies);
    let (index, generation) = handle.into_raw_parts();
    (index as u64 + ((generation as u64) << 32)) as f64
}

/// # Safety: verts aponta pra nverts*3 f32; indices pra nidx u32 (múltiplo de 3).
#[no_mangle]
pub unsafe extern "C" fn rn_collider_trimesh(
    world: *mut World,
    body: f64,
    verts: *const f32,
    nverts: usize,
    indices: *const u32,
    nidx: usize,
) -> f64 {
    let w = &mut *world;
    let vertices: Vec<Point<Real>> = (0..nverts)
        .map(|i| {
            point![
                *verts.add(i * 3),
                *verts.add(i * 3 + 1),
                *verts.add(i * 3 + 2)
            ]
        })
        .collect();
    let tris: Vec<[u32; 3]> = (0..nidx / 3)
        .map(|i| {
            [
                *indices.add(i * 3),
                *indices.add(i * 3 + 1),
                *indices.add(i * 3 + 2),
            ]
        })
        .collect();
    let builder = ColliderBuilder::trimesh(vertices, tris);
    let handle =
        w.colliders
            .insert_with_parent(builder, unpack_handle(body), &mut w.bodies);
    let (index, generation) = handle.into_raw_parts();
    (index as u64 + ((generation as u64) << 32)) as f64
}

/// what: 0 = translation · 1 = rotation (xyzw) · 2 = linvel · 3 = angvel
/// Resultado no scratch.
#[no_mangle]
pub unsafe extern "C" fn rn_body_get(world: *mut World, body: f64, what: f64) {
    let w = &mut *world;
    let Some(rb) = w.bodies.get(unpack_handle(body)) else {
        return;
    };
    match what as i32 {
        1 => {
            let r = rb.rotation();
            w.scratch[0] = r.i as f64;
            w.scratch[1] = r.j as f64;
            w.scratch[2] = r.k as f64;
            w.scratch[3] = r.w as f64;
        }
        2 => {
            let v = rb.linvel();
            w.scratch[0] = v.x as f64;
            w.scratch[1] = v.y as f64;
            w.scratch[2] = v.z as f64;
        }
        3 => {
            let v = rb.angvel();
            w.scratch[0] = v.x as f64;
            w.scratch[1] = v.y as f64;
            w.scratch[2] = v.z as f64;
        }
        _ => {
            let t = rb.translation();
            w.scratch[0] = t.x as f64;
            w.scratch[1] = t.y as f64;
            w.scratch[2] = t.z as f64;
        }
    }
}

/// what: 0 setTranslation(x,y,z) · 1 setRotation(x,y,z,w) · 2 setLinvel ·
/// 3 setAngvel · 4 setNextKinematicTranslation · 5 applyImpulse ·
/// 6 applyTorqueImpulse · 7 wakeUp
#[no_mangle]
pub unsafe extern "C" fn rn_body_set(
    world: *mut World,
    body: f64,
    what: f64,
    x: f64,
    y: f64,
    z: f64,
    qw: f64,
    wake: f64,
) {
    let w = &mut *world;
    let Some(rb) = w.bodies.get_mut(unpack_handle(body)) else {
        return;
    };
    let v = vector![x as f32, y as f32, z as f32];
    let wake_up = wake != 0.0;
    match what as i32 {
        1 => rb.set_rotation(
            Rotation::from_quaternion(nalgebra::Quaternion::new(
                qw as f32, x as f32, y as f32, z as f32,
            )),
            wake_up,
        ),
        2 => rb.set_linvel(v, wake_up),
        3 => rb.set_angvel(v, wake_up),
        4 => rb.set_next_kinematic_translation(v.into()),
        5 => rb.apply_impulse(v, wake_up),
        6 => rb.apply_torque_impulse(v, wake_up),
        7 => rb.wake_up(true),
        _ => rb.set_translation(v, wake_up),
    }
}
