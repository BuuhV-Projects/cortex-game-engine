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

/// Timestep do mundo (s) — o `world.timestep` do rapier3d-compat.
///
/// Sem este par o passo nativo ficava preso no padrão de 1/60 e o
/// `RapierPhysics.advance` do engine (passo semi-fixo, ADR-0257) virava
/// no-op em silêncio: a 75 fps o carro andava 25% rápido demais SÓ no export.
///
/// # Safety: `world` deve vir de rn_world_new e não ter sido liberado.
#[no_mangle]
pub unsafe extern "C" fn rn_world_timestep(world: *mut World) -> f64 {
    (*world).integration_parameters.dt as f64
}

/// # Safety: `world` deve vir de rn_world_new e não ter sido liberado.
#[no_mangle]
pub unsafe extern "C" fn rn_world_set_timestep(world: *mut World, dt: f64) {
    (*world).integration_parameters.dt = dt as Real;
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

/// what: 0 = translation · 1 = rotation (xyzw) · 2 = linvel · 3 = angvel ·
/// 4 = tipo · 5 = nº colliders · 6 = massa · 7 = ligado (0/1) ·
/// 8 = dormindo (0/1)
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
        // 4 = tipo do corpo (0 dinamico, 1 fixo, 2 cinematico) — o jogo usa pra
        // achar o chassi entre os corpos que o veiculo criou (SPEC-0209).
        4 => {
            w.scratch[0] = match rb.body_type() {
                RigidBodyType::Dynamic => 0.0,
                RigidBodyType::Fixed => 1.0,
                _ => 2.0,
            };
        }
        5 => w.scratch[0] = rb.colliders().len() as f64,
        // 6 = massa. O kart-racer usa pra dosar o impulso de frenagem da IA
        // (`-missingBrake * body.mass()`), todo frame (SPEC-0216).
        6 => w.scratch[0] = rb.mass() as f64,
        // 7 = ligado? (0/1). Par de leitura do `setEnabled` (SPEC-0314).
        7 => w.scratch[0] = if rb.is_enabled() { 1.0 } else { 0.0 },
        // 8 = dormindo? (0/1) — o `isSleeping()` do browser (SPEC-0337). Sem
        // ele, sonda que perguntava `isSleeping?.()` contava todo corpo acordado.
        8 => w.scratch[0] = if rb.is_sleeping() { 1.0 } else { 0.0 },
        _ => {
            let t = rb.translation();
            w.scratch[0] = t.x as f64;
            w.scratch[1] = t.y as f64;
            w.scratch[2] = t.z as f64;
        }
    }
}

fn pack_collider(handle: ColliderHandle) -> f64 {
    let (index, generation) = handle.into_raw_parts();
    (index as u64 + ((generation as u64) << 32)) as f64
}

fn unpack_collider(packed: f64) -> ColliderHandle {
    let raw = packed as u64;
    ColliderHandle::from_raw_parts(raw as u32, (raw >> 32) as u32)
}

/// Handle do collider `index` do corpo (-1 se nao existe).
/// # Safety: `world` vivo.
#[no_mangle]
pub unsafe extern "C" fn rn_body_collider(world: *mut World, body: f64, index: f64) -> f64 {
    let w = &*world;
    let Some(rb) = w.bodies.get(unpack_handle(body)) else {
        return -1.0;
    };
    match rb.colliders().get(index as usize) {
        Some(handle) => pack_collider(*handle),
        None => -1.0,
    }
}

/// Grupos de colisao de um collider, no formato do rapier-compat
/// (memberships nos 16 bits altos, filtro nos baixos). `set != 0` grava.
/// # Safety: `world` vivo.
#[no_mangle]
pub unsafe extern "C" fn rn_collider_groups(
    world: *mut World,
    collider: f64,
    set: f64,
    value: f64,
) -> f64 {
    let w = &mut *world;
    let handle = unpack_collider(collider);
    if set != 0.0 {
        if let Some(c) = w.colliders.get_mut(handle) {
            let bits = value as u32;
            c.set_collision_groups(InteractionGroups::new(
                Group::from_bits_truncate(bits >> 16),
                Group::from_bits_truncate(bits & 0xffff),
            ));
        }
        return value;
    }
    match w.colliders.get(handle) {
        Some(c) => {
            let g = c.collision_groups();
            ((g.memberships.bits() << 16) | (g.filter.bits() & 0xffff)) as f64
        }
        None => 0.0,
    }
}

/// what: 0 setTranslation(x,y,z) · 1 setRotation(x,y,z,w) · 2 setLinvel ·
/// 3 setAngvel · 4 setNextKinematicTranslation · 5 applyImpulse ·
/// 6 applyTorqueImpulse · 7 wakeUp · 8 resetForces · 9 resetTorques ·
/// 10 setEnabledRotations · 11 setEnabled
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
        // 8/9 = zerar forcas/torques acumulados; 10 = travar eixos de rotacao
        // (o carro so gira em Y) — x/y/z vem como 0/1 (SPEC-0209).
        8 => rb.reset_forces(wake_up),
        9 => rb.reset_torques(wake_up),
        10 => rb.set_enabled_rotations(x != 0.0, y != 0.0, z != 0.0, wake_up),
        // 11 = liga/desliga o corpo e seus colliders (x = 0/1). O DDD 61 desliga
        // troncos por célula no boot e veículos de serviço fora do turno (SPEC-0314).
        11 => rb.set_enabled(x != 0.0),
        _ => rb.set_translation(v, wake_up),
    }
}

// ─── Veículo raycast (SPEC-0209) ────────────────────────────────────────────
//
// Ponte do `DynamicRayCastVehicleController`. Mesmo desenho do resto: f64 em
// tudo, vetores pelo `scratch` do mundo, superfície só do que o engine usa
// (src/physics/RapierPhysics.ts).

use rapier3d::control::{DynamicRayCastVehicleController, WheelTuning};

pub struct Vehicle {
    ctrl: DynamicRayCastVehicleController,
}

/// Códigos de `rn_vehicle_set_wheel`. Espelhados em rapier-compat.js — mudar
/// aqui exige mudar lá (são um contrato entre as duas pontas).
const WHEEL_SUSPENSION_STIFFNESS: i32 = 0;
const WHEEL_DAMPING_COMPRESSION: i32 = 1;
const WHEEL_DAMPING_RELAXATION: i32 = 2;
const WHEEL_MAX_SUSPENSION_TRAVEL: i32 = 3;
const WHEEL_FRICTION_SLIP: i32 = 4;
const WHEEL_SUSPENSION_REST_LENGTH: i32 = 5;
const WHEEL_ENGINE_FORCE: i32 = 6;
const WHEEL_BRAKE: i32 = 7;
const WHEEL_STEERING: i32 = 8;

/// # Safety: `world` vem de rn_world_new; `chassis` é um handle vivo.
#[no_mangle]
pub unsafe extern "C" fn rn_vehicle_new(world: *mut World, chassis: f64) -> *mut Vehicle {
    let w = &mut *world;
    let handle = unpack_handle(chassis);
    if w.bodies.get(handle).is_none() {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(Vehicle {
        ctrl: DynamicRayCastVehicleController::new(handle),
    }))
}

/// # Safety: `vehicle` vem de rn_vehicle_new e não foi liberado.
#[no_mangle]
pub unsafe extern "C" fn rn_vehicle_free(vehicle: *mut Vehicle) {
    if !vehicle.is_null() {
        drop(Box::from_raw(vehicle));
    }
}

/// Eixo "para cima" do chassi (0=X, 1=Y, 2=Z). O engine usa Y.
/// # Safety: `vehicle` vivo.
#[no_mangle]
pub unsafe extern "C" fn rn_vehicle_set_up_axis(vehicle: *mut Vehicle, axis: f64) {
    (*vehicle).ctrl.index_up_axis = (axis as usize).min(2);
}

/// # Safety: `vehicle` vivo.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn rn_vehicle_add_wheel(
    vehicle: *mut Vehicle,
    px: f64, py: f64, pz: f64,
    dx: f64, dy: f64, dz: f64,
    ax: f64, ay: f64, az: f64,
    rest_length: f64,
    radius: f64,
) {
    let v = &mut *vehicle;
    // Tuning default do Rapier; o engine ajusta cada parâmetro logo em seguida
    // por `set_wheel` (é como a API do browser também funciona).
    let tuning = WheelTuning::default();
    v.ctrl.add_wheel(
        point![px as f32, py as f32, pz as f32],
        vector![dx as f32, dy as f32, dz as f32],
        vector![ax as f32, ay as f32, az as f32],
        rest_length as f32,
        radius as f32,
        &tuning,
    );
}

/// Ajusta UM parâmetro de UMA roda (ver constantes WHEEL_*).
/// # Safety: `vehicle` vivo.
#[no_mangle]
pub unsafe extern "C" fn rn_vehicle_set_wheel(
    vehicle: *mut Vehicle,
    index: f64,
    param: f64,
    value: f64,
) {
    let v = &mut *vehicle;
    let wheels = v.ctrl.wheels_mut();
    let Some(wheel) = wheels.get_mut(index as usize) else {
        return;
    };
    let value = value as f32;
    match param as i32 {
        WHEEL_SUSPENSION_STIFFNESS => wheel.suspension_stiffness = value,
        WHEEL_DAMPING_COMPRESSION => wheel.damping_compression = value,
        WHEEL_DAMPING_RELAXATION => wheel.damping_relaxation = value,
        WHEEL_MAX_SUSPENSION_TRAVEL => wheel.max_suspension_travel = value,
        WHEEL_FRICTION_SLIP => wheel.friction_slip = value,
        WHEEL_SUSPENSION_REST_LENGTH => wheel.suspension_rest_length = value,
        WHEEL_ENGINE_FORCE => wheel.engine_force = value,
        WHEEL_BRAKE => wheel.brake = value,
        WHEEL_STEERING => wheel.steering = value,
        _ => {}
    }
}

/// Integra o veículo. Chame DEPOIS do `rn_world_step` (o raycast das rodas usa
/// o `query_pipeline`, que o step atualiza).
/// # Safety: `vehicle` e `world` vivos.
#[no_mangle]
pub unsafe extern "C" fn rn_vehicle_update(
    vehicle: *mut Vehicle,
    world: *mut World,
    dt: f64,
    groups: f64,
) {
    let v = &mut *vehicle;
    let w = &mut *world;
    // O chassi nunca entra no raycast das proprias rodas. `groups < 0` = sem
    // filtro de grupo (o default do engine); >= 0 usa o formato do compat
    // (memberships nos 16 bits altos, filtro nos baixos).
    let mut filter = QueryFilter::exclude_dynamic().exclude_rigid_body(v.ctrl.chassis);
    if groups >= 0.0 {
        let bits = groups as u32;
        filter = filter.groups(InteractionGroups::new(
            Group::from_bits_truncate(bits >> 16),
            Group::from_bits_truncate(bits & 0xffff),
        ));
    }
    v.ctrl.update_vehicle(
        dt as f32,
        &mut w.bodies,
        &w.colliders,
        &w.query_pipeline,
        filter,
    );
}

/// Estado de uma roda no `scratch` do mundo:
/// [0] em contato (0/1) · [1..3] ponto de contato (mundo) ·
/// [4..6] ponto de conexão no chassi · [7] comprimento da suspensão ·
/// [8] esterço · [9] rotação.
/// # Safety: `vehicle` e `world` vivos.
#[no_mangle]
pub unsafe extern "C" fn rn_vehicle_wheel_state(
    vehicle: *mut Vehicle,
    world: *mut World,
    index: f64,
) {
    let v = &*vehicle;
    let w = &mut *world;
    let Some(wheel) = v.ctrl.wheels().get(index as usize) else {
        w.scratch[0] = 0.0;
        return;
    };
    let info = wheel.raycast_info();
    w.scratch[0] = if info.is_in_contact { 1.0 } else { 0.0 };
    w.scratch[1] = info.contact_point_ws.x as f64;
    w.scratch[2] = info.contact_point_ws.y as f64;
    w.scratch[3] = info.contact_point_ws.z as f64;
    w.scratch[4] = wheel.chassis_connection_point_cs.x as f64;
    w.scratch[5] = wheel.chassis_connection_point_cs.y as f64;
    w.scratch[6] = wheel.chassis_connection_point_cs.z as f64;
    w.scratch[7] = info.suspension_length as f64;
    w.scratch[8] = wheel.steering as f64;
    w.scratch[9] = wheel.rotation as f64;
}

/// Massa/centro de massa/inércia EXPLÍCITOS de um corpo (SPEC-0209). O veículo
/// usa isto pra baixar o centro de massa (anti-capotamento) e afrouxar a
/// inércia de guinada — sem isso o carro roda no eixo errado nas curvas.
///
/// O frame da inércia principal é a identidade (o engine sempre passa
/// quaternion identidade); expor um frame arbitrário custaria 4 f64 a mais por
/// chamada sem uso hoje.
/// # Safety: `world` vivo, `body` um handle válido.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn rn_body_mass_props(
    world: *mut World,
    body: f64,
    mass: f64,
    cx: f64, cy: f64, cz: f64,
    ix: f64, iy: f64, iz: f64,
    wake: f64,
) {
    let w = &mut *world;
    let Some(rb) = w.bodies.get_mut(unpack_handle(body)) else {
        return;
    };
    let props = MassProperties::new(
        point![cx as f32, cy as f32, cz as f32],
        mass as f32,
        vector![ix as f32, iy as f32, iz as f32],
    );
    rb.set_additional_mass_properties(props, wake != 0.0);
}

// ─── Raycast de mundo (SPEC-0216) ───────────────────────────────────────────
// O `followGround` do carro lança um raio por roda pra colar o chassi no chão.
// Sem isto o sistema do carro lançava exceção TODO frame, e a exceção subia até
// o rAF e abortava o tick inteiro do jogo (carro parado, pickups sem girar, UI
// sem responder).

/// Máscara de `filterFlags`, espelhando o `QueryFilterFlags` do Rapier.
const FILTER_EXCLUDE_FIXED: u32 = 1;
const FILTER_EXCLUDE_DYNAMIC: u32 = 2;
const FILTER_EXCLUDE_KINEMATIC: u32 = 4;
const FILTER_EXCLUDE_SENSORS: u32 = 8;

/// Lança um raio no mundo. `1` = acertou (resultado no scratch), `0` = não.
///
/// Scratch no acerto: [0] distância (time of impact), [1..3] normal,
/// [4] handle do collider, [5] handle do corpo dono (-1 se não tiver).
///
/// O filtro roda DENTRO do Rapier (`QueryFilter`): ele poda durante a
/// travessia, em vez de devolver um acerto pro JS descartar depois.
///
/// # Safety: `world` deve vir de `rn_world_new` e estar vivo.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn rn_world_cast_ray(
    world: *mut World,
    ox: f64, oy: f64, oz: f64,
    dx: f64, dy: f64, dz: f64,
    max_toi: f64,
    solid: f64,
    filter_flags: f64,
    exclude_body: f64,
) -> f64 {
    let w = &mut *world;
    let ray = Ray::new(
        point![ox as f32, oy as f32, oz as f32],
        vector![dx as f32, dy as f32, dz as f32],
    );

    let bits = filter_flags as u32;
    let mut flags = QueryFilterFlags::empty();
    if bits & FILTER_EXCLUDE_FIXED != 0 {
        flags |= QueryFilterFlags::EXCLUDE_FIXED;
    }
    if bits & FILTER_EXCLUDE_DYNAMIC != 0 {
        flags |= QueryFilterFlags::EXCLUDE_DYNAMIC;
    }
    if bits & FILTER_EXCLUDE_KINEMATIC != 0 {
        flags |= QueryFilterFlags::EXCLUDE_KINEMATIC;
    }
    if bits & FILTER_EXCLUDE_SENSORS != 0 {
        flags |= QueryFilterFlags::EXCLUDE_SENSORS;
    }
    let filter = QueryFilter {
        flags,
        // `exclude_body < 0` = sem exclusão (o JS manda -1). É como o carro
        // evita acertar o próprio chassi.
        exclude_rigid_body: if exclude_body >= 0.0 {
            Some(unpack_handle(exclude_body))
        } else {
            None
        },
        ..QueryFilter::default()
    };

    let Some((collider_handle, intersection)) = w.query_pipeline.cast_ray_and_get_normal(
        &w.bodies,
        &w.colliders,
        &ray,
        max_toi as f32,
        solid != 0.0,
        filter,
    ) else {
        return 0.0;
    };

    w.scratch[0] = intersection.time_of_impact as f64;
    w.scratch[1] = intersection.normal.x as f64;
    w.scratch[2] = intersection.normal.y as f64;
    w.scratch[3] = intersection.normal.z as f64;
    w.scratch[4] = pack_collider(collider_handle);
    w.scratch[5] = w
        .colliders
        .get(collider_handle)
        .and_then(|c| c.parent())
        .map_or(-1.0, pack_handle);
    1.0
}

/// Propriedades do collider: 0 = é sensor, 1 = handle do corpo dono (-1 se não
/// tiver). É o que um `filterPredicate` precisa pra decidir.
/// # Safety: `world` vivo.
#[no_mangle]
pub unsafe extern "C" fn rn_collider_get(world: *mut World, collider: f64, what: f64) -> f64 {
    let w = &*world;
    let Some(c) = w.colliders.get(unpack_collider(collider)) else {
        return -1.0;
    };
    match what as i32 {
        0 => {
            if c.is_sensor() {
                1.0
            } else {
                0.0
            }
        }
        1 => c.parent().map_or(-1.0, pack_handle),
        _ => -1.0,
    }
}

/// Remove o corpo (e os colliders dele) do mundo. O kart-racer usa no respawn,
/// pra limpar o que sobrou do carro anterior (SPEC-0216).
/// # Safety: `world` vivo.
#[no_mangle]
pub unsafe extern "C" fn rn_body_remove(world: *mut World, body: f64) {
    let w = &mut *world;
    w.bodies.remove(
        unpack_handle(body),
        &mut w.islands,
        &mut w.colliders,
        &mut w.impulse_joints,
        &mut w.multibody_joints,
        true, // remove os colliders junto
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    const GRAVITY: f64 = -10.0;
    const TIMESTEP: f64 = 1.0 / 75.0;
    /// Folga do f32 do Rapier.
    const F32_TOLERANCE: f64 = 1e-5;

    #[test]
    fn timestep_round_trips() {
        unsafe {
            let w = rn_world_new(0.0, GRAVITY, 0.0);
            rn_world_set_timestep(w, TIMESTEP);
            assert!((rn_world_timestep(w) - TIMESTEP).abs() < F32_TOLERANCE);
            rn_world_free(w);
        }
    }

    /// O que importa não é o valor guardado, é o passo usá-lo: um corpo em
    /// queda livre ganha g·dt por passo — g/75, e não o g/60 do padrão.
    #[test]
    fn step_integrates_with_the_timestep() {
        unsafe {
            let w = rn_world_new(0.0, GRAVITY, 0.0);
            rn_world_set_timestep(w, TIMESTEP);
            let handle = unpack_handle(rn_body_create(w, 0.0, 0.0, 0.0, 0.0, 0.0));
            {
                let world = &mut *w;
                world
                    .colliders
                    .insert_with_parent(ColliderBuilder::ball(0.5).build(), handle, &mut world.bodies);
            }
            rn_world_step(w);
            let vy = {
                let world = &*w;
                world.bodies[handle].linvel().y as f64
            };
            assert!((vy - GRAVITY * TIMESTEP).abs() < F32_TOLERANCE, "vy = {vy}");
            rn_world_free(w);
        }
    }

    /// Corpo desligado não cai (sai da simulação) e o `is_enabled` volta pelo
    /// código 7; religado, volta a integrar (SPEC-0314).
    #[test]
    fn set_enabled_freezes_and_resumes_the_body() {
        const SET_ENABLED: f64 = 11.0;
        const GET_ENABLED: f64 = 7.0;
        unsafe {
            let w = rn_world_new(0.0, GRAVITY, 0.0);
            let body = rn_body_create(w, 0.0, 0.0, 0.0, 0.0, 0.0);
            let handle = unpack_handle(body);
            {
                let world = &mut *w;
                world
                    .colliders
                    .insert_with_parent(ColliderBuilder::ball(0.5).build(), handle, &mut world.bodies);
            }
            rn_body_set(w, body, SET_ENABLED, 0.0, 0.0, 0.0, 0.0, 1.0);
            rn_body_get(w, body, GET_ENABLED);
            assert_eq!((&*w).scratch[0], 0.0);
            rn_world_step(w);
            assert_eq!((&*w).bodies[handle].linvel().y, 0.0, "desligado não pode cair");

            rn_body_set(w, body, SET_ENABLED, 1.0, 0.0, 0.0, 0.0, 1.0);
            rn_body_get(w, body, GET_ENABLED);
            assert_eq!((&*w).scratch[0], 1.0);
            rn_world_step(w);
            assert!((&*w).bodies[handle].linvel().y < 0.0, "religado volta a cair");
            rn_world_free(w);
        }
    }

    const SET_NEXT_KINEMATIC: f64 = 4.0;
    const GET_SLEEPING: f64 = 8.0;
    const KIND_DYNAMIC: f64 = 0.0;
    const KIND_FIXED: f64 = 1.0;
    const KIND_KINEMATIC: f64 = 2.0;
    const CAN_SLEEP: f64 = 1.0;
    /// Passos de sobra pra um corpo parado dormir / o mundo assentar.
    const SETTLE_STEPS: usize = 300;
    const CAR_HALF: (f32, f32, f32) = (0.9, 0.7, 2.0);
    const NO_EXCLUDE: f64 = -1.0;
    const RAY_LEN: f64 = 100.0;

    unsafe fn add_box(w: *mut World, kind: f64, x: f64, y: f64, z: f64, half: (f32, f32, f32)) -> f64 {
        let body = rn_body_create(w, kind, x, y, z, CAN_SLEEP);
        let world = &mut *w;
        world.colliders.insert_with_parent(
            ColliderBuilder::cuboid(half.0, half.1, half.2).build(),
            unpack_handle(body),
            &mut world.bodies,
        );
        body
    }

    /// Raio de cima pra baixo em (x, z): devolve o corpo acertado, ou None.
    unsafe fn ray_down(w: *mut World, x: f64, z: f64) -> Option<f64> {
        let hit = rn_world_cast_ray(w, x, 50.0, z, 0.0, -1.0, 0.0, RAY_LEN, 1.0, 0.0, NO_EXCLUDE);
        if hit != 1.0 {
            return None;
        }
        let collider = (&*w).scratch[4];
        Some(rn_collider_get(w, collider, 1.0))
    }

    /// `isSleeping` pelo código 8: dinâmico parado dorme; cinemático não (no
    /// Rapier ele nunca dorme — igual no browser) (SPEC-0337).
    #[test]
    fn is_sleeping_reports_rapier_state() {
        unsafe {
            let w = rn_world_new(0.0, 0.0, 0.0);
            let dynamic = add_box(w, KIND_DYNAMIC, 0.0, 0.0, 0.0, CAR_HALF);
            let kinematic = add_box(w, KIND_KINEMATIC, 10.0, 0.0, 0.0, CAR_HALF);
            for _ in 0..SETTLE_STEPS {
                rn_world_step(w);
            }
            rn_body_get(w, dynamic, GET_SLEEPING);
            assert_eq!((&*w).scratch[0], 1.0, "dinâmico parado dorme");
            rn_body_get(w, kinematic, GET_SLEEPING);
            assert_eq!((&*w).scratch[0], 0.0, "cinemático não dorme");
            rn_world_free(w);
        }
    }

    /// Patch do Rapier (SPEC-0337): cinemático que ficou parado não tem o
    /// collider atualizado — mas quando volta a andar, o collider vai junto
    /// (o raio acha o carro na posição nova, e não na antiga).
    #[test]
    fn idle_kinematic_moves_its_collider_when_commanded_again() {
        const START_X: f64 = 0.0;
        const MOVED_X: f64 = 30.0;
        unsafe {
            let w = rn_world_new(0.0, GRAVITY, 0.0);
            let car = add_box(w, KIND_KINEMATIC, START_X, 0.0, 0.0, CAR_HALF);
            for _ in 0..SETTLE_STEPS {
                rn_world_step(w);
            }
            assert_eq!(ray_down(w, START_X, 0.0), Some(car));
            rn_body_set(w, car, SET_NEXT_KINEMATIC, MOVED_X, 0.0, 0.0, 0.0, 1.0);
            rn_world_step(w);
            assert_eq!(ray_down(w, MOVED_X, 0.0), Some(car), "collider foi junto");
            assert_eq!(ray_down(w, START_X, 0.0), None, "não ficou fantasma na pose antiga");
            rn_world_free(w);
        }
    }

    /// Patch do broad-phase (SPEC-0337): sub-região só é reordenada quando a
    /// região-mãe teve trabalho. O caso que DEPENDE disso: um corpo grande
    /// (camada maior do multi-SAP) andando por cima de corpos pequenos (camada
    /// menor). Se a sub-região não fosse reordenada, o par não apareceria e o
    /// bloco atravessaria as caixas sem empurrar.
    #[test]
    fn big_kinematic_still_pushes_small_bodies() {
        const GROUND_HALF: f32 = 500.0;
        const BLOCK_HALF: f32 = 30.0;
        const BLOCK_START_X: f64 = -80.0;
        const BLOCK_SPEED: f64 = 0.25;
        const SWEEP_STEPS: usize = 600;
        const BOXES: usize = 8;
        // Caixas no FUNDO da sub-região [0, 25) m da camada delas (região de
        // 25 m pra uma caixa de 1 m): o bloco entra na sub-região sem tocar
        // nelas e só as encontra andando lá dentro — o caso que exige reordenar.
        const BOX_FIRST_X: f64 = 15.0;
        const BOX_SPACING: f64 = 1.2;
        const BOX_HALF: f32 = 0.5;
        unsafe {
            let w = rn_world_new(0.0, GRAVITY, 0.0);
            add_box(w, KIND_FIXED, 0.0, -0.5, 0.0, (GROUND_HALF, 0.5, GROUND_HALF));
            let boxes: Vec<f64> = (0..BOXES)
                .map(|k| add_box(w, KIND_DYNAMIC, BOX_FIRST_X + k as f64 * BOX_SPACING, BOX_HALF as f64, 0.0, (BOX_HALF, BOX_HALF, BOX_HALF)))
                .collect();
            let block = add_box(w, KIND_KINEMATIC, BLOCK_START_X, 1.0, 0.0, (BLOCK_HALF, 1.0, BLOCK_HALF));
            for _ in 0..SETTLE_STEPS {
                rn_world_step(w); // caixas assentam e dormem; mundo parado
            }
            for step in 1..=SWEEP_STEPS {
                let x = BLOCK_START_X + step as f64 * BLOCK_SPEED;
                rn_body_set(w, block, SET_NEXT_KINEMATIC, x, 1.0, 0.0, 0.0, 1.0);
                rn_world_step(w);
            }
            let block_back = BLOCK_START_X + SWEEP_STEPS as f64 * BLOCK_SPEED - BLOCK_HALF as f64;
            for (k, b) in boxes.iter().enumerate() {
                rn_body_get(w, *b, 0.0);
                let x = (&*w).scratch[0];
                let y = (&*w).scratch[1];
                // empurrada pra frente do bloco, ou jogada por cima dele — nunca dentro
                let inside = x > block_back && x < block_back + 2.0 * BLOCK_HALF as f64 && y < 2.0;
                assert!(!inside, "caixa {k} ficou dentro do bloco (x = {x}, y = {y})");
            }
            rn_world_free(w);
        }
    }

    /// Instrumento (ignorado no `cargo test`): custo do passo numa cidade
    /// sintética parada — 1.250 fixos, 220 cinemáticos parados, 7 dinâmicos.
    /// `cargo test --release bench_idle_city -- --ignored --nocapture`.
    /// Com o Rapier sem patch: ~0,7–1,2 ms/passo; com o patch: ~0,06 (SPEC-0337).
    #[test]
    #[ignore]
    fn bench_idle_city() {
        const FIXED: usize = 1250;
        const KINEMATIC: usize = 220;
        const DYNAMIC: usize = 7;
        const CITY: f64 = 1800.0;
        const WARMUP: usize = 120;
        const STEPS: usize = 3000;
        const US_PER_S: f64 = 1e6;
        unsafe {
            let w = rn_world_new(0.0, GRAVITY, 0.0);
            add_box(w, KIND_FIXED, 0.0, -0.5, 0.0, (1000.0, 0.5, 1000.0));
            let mut seed: u32 = 12345;
            let mut rnd = || {
                seed = seed.wrapping_mul(1103515245).wrapping_add(12345);
                ((seed >> 8) as f64) / 16777216.0
            };
            for _ in 0..FIXED {
                let (x, z, sx, sz) = (rnd() * CITY - CITY / 2.0, rnd() * CITY - CITY / 2.0, 3.0 + rnd() * 8.0, 3.0 + rnd() * 8.0);
                add_box(w, KIND_FIXED, x, 5.0, z, (sx as f32, 5.0, sz as f32));
            }
            for _ in 0..KINEMATIC {
                let (x, z) = (rnd() * CITY - CITY / 2.0, rnd() * CITY - CITY / 2.0);
                add_box(w, KIND_KINEMATIC, x, 0.7, z, CAR_HALF);
            }
            for k in 0..DYNAMIC {
                add_box(w, KIND_DYNAMIC, k as f64 * 10.0, 0.7, 0.0, CAR_HALF);
            }
            for _ in 0..WARMUP {
                rn_world_step(w);
            }
            let t = std::time::Instant::now();
            for _ in 0..STEPS {
                rn_world_step(w);
            }
            println!("bench_idle_city: {:.1} us/passo", t.elapsed().as_secs_f64() * US_PER_S / STEPS as f64);
            rn_world_free(w);
        }
    }
}
