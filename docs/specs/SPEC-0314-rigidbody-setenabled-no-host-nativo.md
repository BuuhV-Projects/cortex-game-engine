# SPEC-0314 — `RigidBody.setEnabled`/`isEnabled` no host nativo

**Data:** 2026-10-07
**Status:** aceito

## Contexto

O DDD 61 (`D:/jogos/detetive-brasilia`) exportado pro nativo travava no boot:
`ParkTrunks` (`entities/aguasClaras/parkForest.ts`) cria os troncos da mata,
acha os corpos novos por `physics.world.bodies.forEach` e desliga cada um com
`body.setEnabled(false)` — liga/desliga por célula em volta dos focos. O shim
do Rapier do host (`native/js/src/shims/rapier-compat.js`) não tinha
`setEnabled`: `undefined is not a function` no construtor, e o boot parava ali.
Os trabalhos de gás, lixo e ônibus (`missions/{gas,lixo,onibus}/`) usam o mesmo
método pra tirar o veículo da física fora do serviço (`vehicle.body.setEnabled(on)`).

## Decisão

### API (fiel ao `@dimforge/rapier3d-compat` 0.19)

- `RigidBody.setEnabled(enabled: boolean): void` — sem `wakeUp` (o browser não
  tem). Desligado, o corpo e TODOS os colliders dele saem da simulação e das
  consultas (raycast), como no Rapier.
- `RigidBody.isEnabled(): boolean`.

### Ponte (sem função C nova)

Reusa o despacho por código que o `rn_body_set`/`rn_body_get` já têm
(`native/rapier-native/src/lib.rs`), então nem o `native/src/shims/rapier.cpp`
nem a C ABI mudam:

| Lado JS | Código | Rust |
|---|---|---|
| `setEnabled(on)` | `bodySet(…, 11, on?1:0, 0, 0, 0, 1)` | `rb.set_enabled(x != 0.0)` |
| `isEnabled()` | `bodyGet(…, 7)` → `scratch[0]` | `rb.is_enabled()` como 0/1 |

### Fora do escopo

- `Collider.setEnabled`/`isEnabled` e `RigidBodyDesc.setEnabled`: nem o DDD 61
  nem o engine usam (auditoria abaixo). Entram quando um jogo chamar.

## Auditoria (DDD 61 + engine × shim)

Método: nomes de membro de `RigidBody`, `RigidBodySet`, `Collider`,
`ColliderSet`, `World`, `DynamicRayCastVehicleController` e
`KinematicCharacterController` extraídos dos `.d.ts` do rapier3d-compat,
cruzados com todo `.nome` usado em `main.ts`, `entities/`, `missions/`,
`systems/`, `utils/`, `components/`, `ui/` do jogo e em `src/physics/` do
engine, menos o que o shim implementa (`prototype.*`, `*Desc.*`,
`defineProperty`). Cada sobra foi lida no contexto. Escritas de propriedade
(`world.x = …`, o caso silencioso) conferidas à parte.

| Chamada | Onde | Situação |
|---|---|---|
| `RigidBody.setEnabled` | `parkForest.ts` (boot), `gasTruck.ts`, `busVehicle.ts` | **faltava — implementado aqui** |
| `RigidBody.isEnabled` | engine/jogo não chamam | implementado junto (par de leitura, testável) |
| `world.bodies.forEach`, `body.handle`, `body.translation` | `parkForest.ts` | já existiam (SPEC-0313) |
| `body.linvel/angvel/setLinvel/setAngvel/setTranslation/setRotation/setNextKinematicTranslation/applyImpulse/mass` | missões e veículos | já existiam |
| `world.timestep =`, `ctrl.indexUpAxis =`, `world.gravity` | engine | já existiam (ADR-0257, SPEC-0209) |
| `setMassProperties`, `centerOfMass`, `offset`, `radius`, `remove`, `status`, `volume`, `userData`, `velocityY` | — | falsos positivos: API do engine (`Vehicle`, `CharacterBody`), three.js ou UI do jogo |

Nada mais faltando nas chamadas que o DDD 61 faz ao Rapier.

## Consequências

- O boot do DDD 61 passa do `ParkTrunks`; os troncos ligam/desligam por célula
  no export como no Studio, e os veículos de serviço saem da física fora do
  turno.
- Códigos novos no contrato JS↔Rust: `bodySet` 11 e `bodyGet` 7. Testados nas
  duas pontas (`tests/native/rapier-compat-world.test.ts` e os testes do crate).
- Precisa rebuildar o `rapier_native.dll` (`yarn build:host`): o shim novo com
  a DLL antiga manda o código 11, que cai no `_ =>` (setTranslation) e
  TELETRANSPORTA o corpo pra origem em vez de desligá-lo — sem erro nenhum.
