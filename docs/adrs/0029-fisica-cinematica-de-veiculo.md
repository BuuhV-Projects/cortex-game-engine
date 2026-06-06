# 0029 - Física cinemática de veículo (raycast) no engine

**Data:** 2026-05-31
**Status:** removido (2026-06-05) — a física de veículo (`VehicleGravitySystem`,
`VehicleWallCollisionSystem`, `VehiclePhysics`) foi retirada do engine a pedido do
usuário; o foco virou cenas de plataforma/ilhas, não veículo. O
`KinematicBodyComponent` permanece (usado pelo editor). Registro mantido como
histórico.

## Contexto

Fase 2 da migração do corrida-teste (ver ADR-0028). O jogo tinha gravidade +
ground-snap e colisão lateral implementados como sistemas acoplados a
`VehicleComponent` (`velocityY`, `grounded`, `speed`). São reutilizáveis por
qualquer jogo de veículo.

O engine já tem `PhysicsSystem` (src/core/Physics.ts) — colisão por impulso/AABB
com `RigidBodyComponent`. É uma abordagem **diferente** (simulação dinâmica), não
serve pro caso "carro arcade que gruda no relevo e raspa em parede". Por isso os
novos sistemas são **cinemáticos por raycast**, separados do `PhysicsSystem`.

Decisão de abstração (com o usuário): os sistemas têm parametrização de veículo
(`wheelRadius`, `bumperHeight`, `halfLength`) — então são **nomeados como veículo**
em vez de "Kinematic genérico". O estado (`KinematicBodyComponent`: velocityY,
grounded, horizontalSpeed) permanece genérico, consumido por esses sistemas.

## Decisão

Adicionados em `src/physics/`, re-exportados em `src/index-runtime.ts`:

- **`VehicleGravitySystem`** (priority 5) — gravidade + ground-snap por raycast.
  Mantém `probeAbove=3` (pequeno de propósito) e `far` adaptativo. Só gruda quando
  caindo (`y <= groundY`); subindo segue balístico. `onFallOff` pra respawn.
- **`VehicleWallCollisionSystem`** (priority 2) — 3 raycasts frontais; filtra chão
  por ângulo da normal. **Mudança vs original (decisão do usuário): desliza, não
  trava** — empurra o veículo pra fora **ao longo da normal** da parede, preservando
  o movimento tangente, mantendo `horizontalSpeed` (sem perder velocidade por
  padrão, `wallFriction=0`). Usa a normal em world-space (`transformDirection`).
- **`VehiclePhysics`** — agrupador que registra os dois no `World` contra a mesma
  mesh de `ground`, com `pauseWhen` compartilhado (ex.: pausar no editor).

Todos operam sobre `TransformComponent` + `KinematicBodyComponent`. `deltaTime` é
recebido em ms (convenção do engine) e convertido pra segundos internamente.

`VENDOR_TYPE_MODULES` (electron/main.ts) estendido com `physics`.

## Consequências

- Coexiste com `PhysicsSystem`/`RigidBodyComponent` — propósitos distintos
  (cinemático-raycast arcade vs impulso/AABB). Cabe ao jogo escolher.
- O "deslize" é um modelo arcade simples (correção posicional ao longo da normal),
  não resolução de contato física real; impacto frontal puro vira um "encosta e
  segue revolucionando" sem avançar — aceitável pro caso de uso.
- Conformação ao terreno (pitch/roll) **não** está aqui — fica no jogo (ADR-0028).
- corrida-teste migrado: `VehicleComponent` perdeu `speed/velocityY/grounded` (agora
  no `KinematicBodyComponent`); `VehicleMovementSystem`/`GearboxSystem`/`HudSystem`/
  `EditorCameraSystem` passaram a ler/escrever `KinematicBodyComponent`; `RaceScene`
  usa `VehiclePhysics`; sistemas locais de física removidos. `vite build` verde.
