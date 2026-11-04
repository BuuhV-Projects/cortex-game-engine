[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierPhysicsSystem

# Class: RapierPhysicsSystem

Defined in: [src/systems/RapierPhysicsSystem.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/RapierPhysicsSystem.ts#L25)

Liga o Rapier ao ECS (ADR-0061): cria um corpo por entidade com
[RapierBodyComponent](RapierBodyComponent.md) + [Object3DComponent](Object3DComponent.md), avança a simulação (passo
fixo) e **escreve o transform do `Object3D`** (posição + quaternion) a partir do
corpo — o Rapier é o **dono do transform** desses objetos (não os ponha também no
`Object3DSyncSystem`).

Recebe um [RapierPhysics](RapierPhysics.md) **já criado** (`await RapierPhysics.create()` no
boot), então roda **síncrono** dentro do `World.tick`.

## Example

```ts
const physics = await RapierPhysics.create({ x: 0, y: -9.81, z: 0 })
world.addSystem(new RapierPhysicsSystem(physics))
```

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new RapierPhysicsSystem**(`physics`): `RapierPhysicsSystem`

Defined in: [src/systems/RapierPhysicsSystem.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/RapierPhysicsSystem.ts#L37)

#### Parameters

##### physics

[`RapierPhysics`](RapierPhysics.md)

#### Returns

`RapierPhysicsSystem`

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

Defined in: [src/ecs/System.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L80)

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

> **priority**: `number` = `8`

Defined in: [src/systems/RapierPhysicsSystem.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/RapierPhysicsSystem.ts#L28)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### profileLabel

> `readonly` **profileLabel**: `"RapierPhysicsSystem"` = `'RapierPhysicsSystem'`

Defined in: [src/systems/RapierPhysicsSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/RapierPhysicsSystem.ts#L26)

Nome do sistema no perfil por sistema (`World.enableSystemProfile`, SPEC-0236).
Sem ele o perfil usa `constructor.name`, que no bundle minificado vira `fx`,
`DBe`… — por isso todo sistema da engine declara o seu (SPEC-0671).

#### Overrides

[`System`](System.md).[`profileLabel`](System.md#profilelabel)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`Object3DComponent`](Object3DComponent.md) \| *typeof* [`RapierBodyComponent`](RapierBodyComponent.md))[]

Defined in: [src/systems/RapierPhysicsSystem.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/RapierPhysicsSystem.ts#L27)

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

Defined in: [src/systems/RapierPhysicsSystem.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/RapierPhysicsSystem.ts#L42)

Libera o mundo do Rapier (handle nativo/WASM) — chamado no World.clear.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`dispose`](System.md#dispose)

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/RapierPhysicsSystem.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/RapierPhysicsSystem.ts#L46)

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
