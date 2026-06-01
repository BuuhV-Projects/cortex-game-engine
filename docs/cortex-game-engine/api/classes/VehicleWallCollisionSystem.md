[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleWallCollisionSystem

# Class: VehicleWallCollisionSystem

Defined in: [src/physics/VehicleWallCollisionSystem.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L41)

Colisão lateral grosseira contra paredes/obstáculos verticais via 3 raycasts
(frente-esquerda, frente, frente-direita) na largura do veículo. Filtra
"chão" (normal quase vertical) pra sair de rampa não contar como parede.

**Desliza, não trava:** ao detectar penetração do para-choque numa parede, o
veículo é empurrado pra fora **ao longo da normal** da parede, preservando o
movimento **tangente** — então ele raspa e desliza até sair, em vez de parar.
A `horizontalSpeed` é mantida por padrão (`wallFriction = 0`).

Não é física real (sem Cannon/Rapier) — é um modelo arcade por raycast.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new VehicleWallCollisionSystem**(`ground`, `options?`): `VehicleWallCollisionSystem`

Defined in: [src/physics/VehicleWallCollisionSystem.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L59)

#### Parameters

##### ground

`Object3D`

##### options?

[`VehicleWallCollisionOptions`](../interfaces/VehicleWallCollisionOptions.md) = `{}`

#### Returns

`VehicleWallCollisionSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### priority

> **priority**: `number` = `2`

Defined in: [src/physics/VehicleWallCollisionSystem.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L43)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`KinematicBodyComponent`](KinematicBodyComponent.md))[]

Defined in: [src/physics/VehicleWallCollisionSystem.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L42)

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

Defined in: [src/physics/VehicleWallCollisionSystem.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleWallCollisionSystem.ts#L72)

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
