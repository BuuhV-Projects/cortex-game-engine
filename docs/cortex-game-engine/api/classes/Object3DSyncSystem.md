[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Object3DSyncSystem

# Class: Object3DSyncSystem

Defined in: [src/systems/Object3DSyncSystem.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L18)

Sincroniza `TransformComponent` → `Object3D.position` / `rotation.y`.

Roda depois da movimentação/física (priority 10) pra garantir que o frame
renderizado reflita o estado lógico atualizado.

Seta `rotation.order = 'YXZ'` a cada frame de propósito: assim o yaw
(`rotation.y`) é aplicado primeiro e pitch/roll (`rotation.x`/`.z`) — que
outros sistemas (ex.: conformação ao terreno do jogo) aplicam direto no
`Object3D` — ficam "locais" à entidade já virada. Setar toda frame protege
contra algo que tenha trocado a ordem.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new Object3DSyncSystem**(): `Object3DSyncSystem`

#### Returns

`Object3DSyncSystem`

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

> **priority**: `number` = `10`

Defined in: [src/systems/Object3DSyncSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L20)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`Object3DComponent`](Object3DComponent.md))[]

Defined in: [src/systems/Object3DSyncSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L19)

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

Defined in: [src/ecs/System.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L82)

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

> **update**(`entities`): `void`

Defined in: [src/systems/Object3DSyncSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L22)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
