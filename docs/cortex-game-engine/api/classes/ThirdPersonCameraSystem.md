[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ThirdPersonCameraSystem

# Class: ThirdPersonCameraSystem

Defined in: [src/systems/ThirdPersonCameraSystem.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L31)

Câmera de perseguição (terceira pessoa) estilo arcade: fica atrás e acima do
alvo (offset rotacionado pelo `rotationY`) e olha levemente à frente dele,
com interpolação exponencial pra suavizar.

Segue a entidade que tiver `TransformComponent` + `FollowCameraTargetComponent`
(espera no máximo uma). Serve qualquer entidade, não só veículos.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new ThirdPersonCameraSystem**(`camera`, `options?`): `ThirdPersonCameraSystem`

Defined in: [src/systems/ThirdPersonCameraSystem.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L44)

#### Parameters

##### camera

`PerspectiveCamera`

##### options?

[`ThirdPersonCameraOptions`](../interfaces/ThirdPersonCameraOptions.md) = `{}`

#### Returns

`ThirdPersonCameraSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### priority

> **priority**: `number` = `20`

Defined in: [src/systems/ThirdPersonCameraSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L33)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`FollowCameraTargetComponent`](FollowCameraTargetComponent.md))[]

Defined in: [src/systems/ThirdPersonCameraSystem.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L32)

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

Defined in: [src/systems/ThirdPersonCameraSystem.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonCameraSystem.ts#L56)

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
