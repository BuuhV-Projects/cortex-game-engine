# SPEC-0671 — Teto de subpassos e perfil legível

**Data:** 2026-11-03
**Status:** implementado

## Contexto

O DDD 00 (Port Hollow) mede no export nativo `world` 31–58 ms, com o passo do Rapier do `VehicleArcadeSystem` em
37–62%. Quatro problemas apareceram na mesma investigação:

1. A física não tem teto de subpassos: quadro lento → mais passos → quadro mais lento.
2. O perfil por sistema (SPEC-0236) usa `system.constructor.name`, que no bundle do navegador sai minificado
   (`fx`, `DBe`, `v0`) — não dá para saber qual sistema come o `world`.
3. A ponte do editor (`EditorBridge`) serializa o estado TODO quadro quando nada muda: o throttle de
   `MIN_INTERVAL_MS` só atualizava o instante depois de enviar.
4. No host nativo, cada getter de roda do veículo (`wheelChassisConnectionPointCs`, `wheelSuspensionLength`,
   `wheelSteering`, …) chama `__rapierNative.vehicleWheelState` de novo: o `wheelLocalTransform` faz 3 chamadas
   nativas por roda por quadro para ler o mesmo estado.

## Decisão

### 1. Teto de subpassos (ADR-0672)

`physicsSubsteps(dt, maxStep, maxSteps)` (`src/physics/physicsSubsteps.ts`, puro) devolve `{ steps, step }`:
`steps = min(ceil(dt / maxStep), maxSteps)`, `step = min(dt, steps × maxStep) / steps`. `RapierPhysics.advance` usa
`MAX_PHYSICS_STEP_S` e `this.maxStepsPerFrame` (default `MAX_PHYSICS_STEPS = 3`, editável pelo jogo:
`physics.maxStepsPerFrame = 5`). O excedente acima de `3/60 s` é descartado (o tempo desacelera).

Consumidores verificados: `VehicleArcadeSystem` e `VehicleControlSystem` chamam `advance` e ignoram o retorno; não
há `alpha`/interpolação na engine; `CharacterPhysicsSystem` e `RapierPhysicsSystem` não passam por `advance`.

Para caber no limite de 500 linhas, o `RapierPhysics.ts` (693) foi dividido em módulos INTERNOS — não exportados
pelo `index-runtime.ts`, nem referenciados pelo `.d.ts` público, então o `VENDOR_TYPE_MODULES` não muda:

- `rapierRuntime.ts`: carga do WASM, `RapierBody`, collider por `BodySpec`, trimesh de um `Object3D`;
- `vehicleInternals.ts`: montagem do controller, pose das rodas, anti-capotamento, massa, tuning;
- `physicsSubsteps.ts`: o cálculo de passos.

### 2. Perfil por sistema legível

`System` ganha `profileLabel?: string`; o `World.tick` acumula em `system.profileLabel ?? system.constructor.name`.
Cada sistema da engine declara `override readonly profileLabel = '<NomeDaClasse>'` — o mesmo texto que o perfil já
mostrava sem minificação, então quem lê o perfil (`PerfTrace`) não muda.

O nome é `profileLabel`, e não `label`, porque `label` já existe em sistemas (o `MeshEditSystem` tem um método
privado `label`) e é provável em jogos. Uma subclasse de sistema da engine herda o rótulo da base; para aparecer com
nome próprio no perfil, declara o seu.

Ficaram SEM label, por estarem em arquivo acima de 500 linhas (rotulá-los exigiria dividir o arquivo nesta mudança):
`PhysicsSystem` (`src/core/Physics.ts`, 811 linhas, física 2D) e `ObjectEditSystem` (`src/editor/ObjectEditSystem.ts`,
627, só no editor). Nenhum dos dois aparece no perfil do DDD 00. Saem minificados até alguém dividir o arquivo.

### 3. Throttle da ponte do editor

O instante (`lastDescribedAt`) é atualizado ANTES de descrever/serializar: sem `force`, a descrição + o
`JSON.stringify` rodam no máximo uma vez a cada `MIN_INTERVAL_MS` (80 ms), mude o JSON ou não. `force` (handshake,
edição do usuário) continua ignorando o throttle.

### 4. Estado da roda lido uma vez no host nativo

O shim `native/js/src/shims/rapier-compat.js` (código da engine, não de terceiros) guarda o estado de cada roda numa
cópia própria, válida até a próxima `updateVehicle` ou setter de roda (geração do controller). Os getters leem da
cópia: uma chamada `vehicleWheelState` por roda por geração. O Rapier do browser só muda o estado da roda nesses
mesmos pontos.

Para caber no limite, o shim (652 linhas) foi dividido: veículo em `rapier-compat-vehicle.js`, consultas
(raycast, contatos) em `rapier-compat-queries.js`; o `rapier-compat.js` instala os dois no `World`.

### 5. `updateMatrixWorld` nos passes de sombra — pendente

O `updateMatrixWorld` repetido é do `Renderer.render` do three (`node_modules/three/src/renderers/common/Renderer.js`,
linha ~1578): cada passe que chama `render(scene, …)` com `scene.matrixWorldAutoUpdate === true` percorre a árvore.
É código de terceiros; a engine não chama `scene.updateMatrixWorld` várias vezes por quadro. A saída do lado da
engine (desligar `matrixWorldAutoUpdate` da cena e fazer UM `updateMatrixWorld` por quadro antes do render) mexe em
`Game.ts` (acima de 500 linhas) e em quem conta com o auto-update (espelho nativo, `matrixFreeze`); não coube sem
risco nesta mudança.

## Consequências

- Abaixo de 20 fps a física desacelera (ver ADR-0672); o teste do passo semi-fixo passa a esperar 3 passos para
  um quadro de 100 ms.
- O perfil por sistema é legível no bundle minificado. Subclasse de sistema da engine aparece com o rótulo da base
  até declarar o seu `profileLabel`.
- A ponte do editor deixa de serializar todo quadro em play.
- No nativo, ler a pose das 4 rodas custa 4 chamadas nativas por quadro em vez de 12.
