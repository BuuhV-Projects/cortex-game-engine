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
- **Exige infra Rapier no jogo**: terreno+road viram colliders trimesh
  (`addTrimeshFromObject` por `cortexTerrain`/`cortexRoad`). O personagem a pé segue no
  CharacterPhysics (custom).
- **Implementado** (DDD-61-CORTEX `main.ts`): `RapierPhysics.create()` + colliders +
  `createVehicle` (chassi + 4 rodas nas posições do `car.glb`) + `VehicleControlSystem`
  (`active: () => driving`). Switch a pé↔carro pela interação (A entra, B sai); player
  some ao dirigir. O `VehicleControlSystem` (priority 30) roda DEPOIS da câmera de 3ª
  pessoa pra a chase cam vencer ao dirigir.
- **Tuning pendente** (só dirigindo): força do motor/ré, grip (`frictionSlip`),
  suspensão, alinhamento chassi×malha e posição/raio das rodas. Sem spin/esterço visual
  das rodas em v1 (a malha do carro segue o chassi inteiro) — `wheelTransform(i)` já
  existe pra ligar isso depois.
- **Config como DADO (em andamento):** os tunáveis (motor, freio, freio-de-mão,
  suspensão altura/rigidez, grip, esterço, **centro de massa** via `chassisOffset`, massa,
  velocidade máx do velocímetro) viram campo `vehicle` no nó da cena (`SceneDefinition`),
  lido pelo jogo — em vez de cravado no código. **Camada 1** (schema + leitura) feita;
  **Camada 2** (seção "Veículo" no Inspector + overlay) pendente. Segue a regra do projeto
  (física = dado editável, não código).
- Extras: `wheelLocalTransform` (sync das rodas: suspensão+esterço+rolagem) + `extraSpin`
  (wheelspin sob aceleração); chase cam ORBITAL (mouse/2º stick + auto-follow);
  handbrake (Espaço/A).
- Ver [[engine-terceira-pessoa-adr-0074]] (gamepad-first reusado no controle do carro).
