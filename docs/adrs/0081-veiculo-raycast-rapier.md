# 0081 - Veículo raycast (Rapier) no engine

**Data:** 2026-06-28
**Status:** aceito (substitui o [0029](0029-fisica-cinematica-de-veiculo.md))

## Contexto

O ADR-0029 **removeu** física de veículo do engine (foco em plataforma/ilhas). Agora
o jogo DDD-61-CORTEX é open-world dirigível e o controlador de carro arcade (cinemático,
no jogo) era inferior. Referência do usuário: um car controller three.js + Cannon
(RaycastVehicle — rodas por raycast + suspensão). O engine **já usa Rapier**, que tem o
equivalente nativo (`DynamicRayCastVehicleController`) — então dá pra ter o sistema "de
verdade" sem trazer Cannon (evita 2 físicas).

## Decisão

- **`Vehicle`** (src/physics/RapierPhysics.ts) — wrapper do raycast vehicle do Rapier:
  chassi (rigid body dinâmico + box) + N rodas (`addWheel`) com suspensão (stiffness/
  compression/relaxation/travel/restLength) e `frictionSlip` (grip arcade). Métodos:
  `setEngineForce`/`setBrake`/`setSteering`, `update(dt)` (chamar **antes** do
  `physics.step()`), `forwardSpeed()`, `chassisTranslation/Rotation()`, `wheelTransform(i)`
  (transform mundial da roda pra sincronizar a malha do `.glb`), `reset()`.
- **`RapierPhysics.createVehicle(spec)`** monta tudo. `VehicleSpec`/`VehicleWheelSpec`
  expostos no runtime.
- As rodas **raycastam o mundo Rapier** (no WASM) → o terreno/obstáculos precisam ser
  colliders Rapier. **Sem custo de raycast na CPU/JS** (importante: o gargalo de FPS
  anterior era exatamente raycast em JS).

## Consequências

- Substitui o `CarControlSystem` arcade do jogo por um veículo físico real (suspensão,
  grip, capota se exagerar — tunado "arcade-real").
- **Exige infra Rapier no jogo**: o terreno vira collider Rapier (heightfield) e o
  `RapierPhysicsSystem` passa a rodar. O personagem a pé segue no CharacterPhysics
  (custom) por ora.
- Pendente (próximos passos): terreno→collider Rapier, `VehicleControlSystem` (gamepad
  + sync malha/rodas + chase cam), fiação no jogo, e **tuning** do handling dirigindo.
- Ver [[engine-terceira-pessoa-adr-0074]] (gamepad-first reusado no controle do carro).
