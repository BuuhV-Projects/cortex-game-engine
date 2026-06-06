[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PlatformerPhysicsSystem

# Class: PlatformerPhysicsSystem

Defined in: [src/systems/PlatformerPhysicsSystem.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L18)

Física de plataforma 2.5D no plano **XY**: gravidade, movimento horizontal por
intenção (`PlatformerBodyComponent.moveDir`), pulo, e **colisão AABB por eixo**
contra os sólidos. Resolve X e depois Y (estilo platformer clássico): pousa no
topo (`grounded`), bate a cabeça no teto, e bloqueia nas paredes. Plataformas
`oneWay` só colidem vindo de cima.

Recebe TODAS as entidades com `Transform` + `Collider` (atores E sólidos);
separa internamente quem tem `PlatformerBodyComponent` (ator). Roda antes do
`Object3DSyncSystem` (priority 10), pra a mesh refletir a posição resolvida.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new PlatformerPhysicsSystem**(): `PlatformerPhysicsSystem`

#### Returns

`PlatformerPhysicsSystem`

#### Inherited from

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/ecs/System.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L65)

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

> **priority**: `number` = `5`

Defined in: [src/systems/PlatformerPhysicsSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L20)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`Collider2DComponent`](Collider2DComponent.md))[]

Defined in: [src/systems/PlatformerPhysicsSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L19)

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

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/PlatformerPhysicsSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L22)

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
