# 0209 - Veículo raycast do Rapier no host nativo

**Data:** 2026-09-19
**Status:** aceito

## Contexto

`world.createVehicleController` lançava no host: o
`DynamicRayCastVehicleController` do Rapier nunca foi exposto pelo
`rapier-native`. Consequência (SPEC-0208): **jogo de carro/kart roda no Studio,
mas não no export nem no preview nativo** — o `kart-racer` morre no setup.

O `rapier3d` 0.22 que o host já usa **tem** o controller
(`src/control/ray_cast_vehicle_controller.rs`); o que falta é a ponte.

## Superfície necessária

Levantada do que o engine realmente consome (`src/physics/RapierPhysics.ts`),
não da API inteira do Rapier:

| Construção | Por roda (setters) | Por frame | Leitura por roda |
|---|---|---|---|
| `createVehicleController(chassis)` | stiffness, compression, relaxation, maxTravel, frictionSlip, restLength | `updateVehicle(dt)` | `wheelIsInContact` |
| `indexUpAxis = 1` | engineForce, brake, steering | | `wheelContactPoint` |
| `addWheel(pos, dir, axle, rest, radius)` | | | `wheelChassisConnectionPointCs`, `wheelSuspensionLength`, `wheelSteering`, `wheelRotation` |

## Decisão

Segue o desenho que o `rapier-native` já tem: **superfície mínima e achatada**,
`f64` em tudo, resultados vetoriais pelo `scratch` do mundo — zero marshalling
por chamada.

### Rust (`native/rapier-native/src/lib.rs`)

```
rn_vehicle_new(world, chassis) -> *mut Vehicle
rn_vehicle_free(vehicle)
rn_vehicle_add_wheel(v, px,py,pz, dx,dy,dz, ax,ay,az, rest, radius)
rn_vehicle_set_wheel(v, index, param, value)      // param achatado
rn_vehicle_update(v, world, dt)
rn_vehicle_wheel_state(v, world, index)           // escreve no scratch
rn_vehicle_set_up_axis(v, axis)
```

**`set_wheel` com um `param` numérico em vez de nove funções**: os setters
diferem só no campo do `Wheel`, e nove símbolos C para nove campos seria ruído
nas três camadas. Os códigos vivem em um lugar só (`WheelParam`) e são
espelhados no JS.

**`wheel_state` escreve no scratch** em vez de devolver struct: é o mesmo
mecanismo do `rn_body_get`, e evita alocar objeto por roda por frame (num carro
de 4 rodas a 60 fps são 240 objetos/s).

Layout do scratch: `[0]` em contato (0/1), `[1..3]` ponto de contato (mundo),
`[4..6]` ponto de conexão no chassi, `[7]` comprimento da suspensão,
`[8]` esterço, `[9]` rotação da roda.

### C++ (`native/src/shims/rapier.cpp`)

Espelha as sete funções no objeto `__rapierNative`, como as demais.

### JS (`native/js/src/shims/rapier-compat.js`)

Reconstrói a **forma** da API do Rapier do browser
(`DynamicRayCastVehicleController`), para o engine não saber a diferença:
`addWheel`, os `setWheel*`, `updateVehicle`, os getters e `indexUpAxis` como
propriedade (é propriedade no Rapier, não método).

Os getters leem o `scratch` **depois** de chamar `wheel_state` — o mesmo
contrato do `RigidBody` do shim.

## O que o jogo real exigiu além do controller

Levantar a superfície pelo `RapierPhysics.ts` **não bastou**: rodar o
`kart-racer` no host revelou, um erro por vez, o que o JOGO usa direto do
Rapier. Cada item abaixo derrubava o carregamento com uma mensagem que não
dizia qual função faltava (`undefined is not a function`):

| Faltava | Para quê | Onde entrou |
|---|---|---|
| `RigidBody.setAdditionalMassProperties` | centro de massa baixo (anti-capotamento) e inércia de guinada | `rn_body_mass_props` |
| `isDynamic` / `isFixed` / `isKinematic` | achar o chassi entre os corpos que o `createVehicle` criou | `rn_body_get` (código 4) |
| `numColliders` / `collider(i)` | ligar/desligar colisão entre carros no respawn | `rn_body_collider` + tipo `Collider` |
| `collisionGroups` / `setCollisionGroups` | idem | `rn_collider_groups` |
| `resetForces` / `resetTorques` | zerar acúmulo por frame | `rn_body_set` (8, 9) |
| `setEnabledRotations` | o carro só gira em Y | `rn_body_set` (10) |
| `world.vehicleControllers` (iterável) | o jogo varre para achar o controller do seu chassi | lista no `World` + `Symbol.iterator` |
| `controller.chassis()` | comparar handles nessa varredura | referência guardada na criação |
| `HTMLElement` e afins | `document.activeElement instanceof HTMLElement` | construtores no `dom-lite` |

O último não é Rapier: o jogo tira o foco de campos de UI e o `instanceof`
derrubava tudo com `ReferenceError`. Os construtores agora existem e `instanceof`
dá `false` — que é a resposta certa num host sem DOM.

## Validação

Export do `kart-racer` (`--debug`) rodando no host: **o Circuito Capital carrega
e renderiza**, sem erro no log. Screenshot em `.cortex/kart-no-host.png` — a
largada com os carros na pista.

HUD do próprio jogo: `FPS 22 · 44.9 ms`, **626 draws**, 3,18 M tris,
`wld 1.0 · ui 2.0 · rnd 47.0`.

Dois números que valem registro: os **626 draws** (contra 2189 no preview do
Studio) mostram o merge estático + render bundles do host funcionando; e
`rnd 47 ms` confirma que, no Hermes, o render segue sendo o gargalo — a física
do carro custa 1 ms.

24 unitários entre `rapier-compat-vehicle.test.ts` e `rapier-compat-world.test.ts`.

## O que falta

**O filtro de raycast por callback.** A assinatura completa do Rapier é
`updateVehicle(dt, flags, groups, predicate)`; aqui os **grupos** são
repassados ao filtro nativo, e o **predicate é ignorado** (com um aviso, uma
vez). O `kart-racer` o usa para o carro em respawn virar "fantasma" para as
rodas dos outros — no host, esse efeito não acontece: as rodas enxergam todos
os colliders que os grupos permitem.

Implementar exige chamar JS de dentro do Rust a cada collider candidato, por
roda, por frame (ponteiro de função no C ABI → NAPI). É viável, mas é uma
frente própria — e cara o bastante para merecer medição antes.

## Consequências

- Jogo de carro/kart passa a rodar no export e no preview nativo.
- O `rapier_native.dll` precisa ser **recompilado** (`cargo build --release`) e
  copiado para o export; quem só puxar o repo sem rebuildar continua com o
  erro antigo.
- A ponte cobre o que o engine usa hoje. Campos do `Wheel` fora dessa lista
  (`side_friction_stiffness`, `max_suspension_force`, impulsos) não estão
  expostos — acrescentar é adicionar um código em `WheelParam`.
- `updateVehicle` depende do `query_pipeline` atualizado; o `rn_world_step` já
  o atualiza a cada passo, então a ordem continua sendo **step → update**.
