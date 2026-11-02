[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleDriverSystem

# Class: VehicleDriverSystem

Defined in: [src/systems/VehicleDriverSystem.ts:228](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleDriverSystem.ts#L228)

**Piloto no veículo** (SPEC-0275): por entidade, na ordem fixa
assento ([VehicleSeatAttachmentComponent](VehicleSeatAttachmentComponent.md)) → animação
([VehicleAnimatorComponent](VehicleAnimatorComponent.md)) → pose ([ProceduralDriverPoseComponent](ProceduralDriverPoseComponent.md)).
Cada componente é opcional. Prioridade 55: depois de quem escreve os
parâmetros (input 30, scripts de IA 50).

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new VehicleDriverSystem**(`pauseWhen?`): `VehicleDriverSystem`

Defined in: [src/systems/VehicleDriverSystem.ts:233](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleDriverSystem.ts#L233)

#### Parameters

##### pauseWhen?

() => `boolean`

#### Returns

`VehicleDriverSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### keepOnClear

> **keepOnClear**: `boolean` = `false`

Defined in: [src/ecs/System.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L51)

Se `true`, `World.clear()` PRESERVA este sistema (não chama `dispose`
nem remove) ao trocar de cena. Para overlays que sobrevivem à troca de fase
— ex.: os sistemas do editor F2 (câmera livre, seleção, gizmos). Por padrão
`false` (sistema da cena/jogo, é removido no clear).

#### Inherited from

[`System`](System.md).[`keepOnClear`](System.md#keeponclear)

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/ecs/System.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L73)

Predicado opcional de PAUSA: se definido e retornar `true` num tick, o
`World` pula o `update` deste sistema nesse frame. Usado, por ex., pra pausar
a gameplay (física/input) enquanto o editor está ativo
(`pauseWhen = () => game.editorActive`).

#### Returns

`boolean`

#### Inherited from

[`System`](System.md).[`pauseWhen`](System.md#pausewhen)

***

### priority

> **priority**: `number` = `55`

Defined in: [src/systems/VehicleDriverSystem.ts:231](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleDriverSystem.ts#L231)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: `never`[] = `[]`

Defined in: [src/systems/VehicleDriverSystem.ts:230](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleDriverSystem.ts#L230)

Construtores dos componentes que este sistema requer.

O `World` usa essa lista para filtrar as entidades antes de chamar `update`,
garantindo que apenas entidades com todos os componentes declarados sejam
repassadas ao sistema.

Subclasses devem sobrescrever este campo estático.

#### Example

```ts
static requiredComponents = [TransformComponent, VelocityComponent];
```

#### Overrides

[`System`](System.md).[`requiredComponents`](System.md#requiredcomponents)

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/ecs/System.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L90)

Libera recursos ao remover o sistema — chamado por [World.clear](World.md#clear) (e
pode ser chamado manualmente). No-op por padrão; sobrescreva pra liberar
handles nativos que o GC não coleta sozinho (ex.: o mundo do Rapier em
[RapierPhysicsSystem](RapierPhysicsSystem.md)). Essencial pra trocar de cena/fase sem vazar.

#### Returns

`void`

#### Inherited from

[`System`](System.md).[`dispose`](System.md#dispose)

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/VehicleDriverSystem.ts:238](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleDriverSystem.ts#L238)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`.

##### deltaTime

`number`

Tempo decorrido desde o último tick, em segundos.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
