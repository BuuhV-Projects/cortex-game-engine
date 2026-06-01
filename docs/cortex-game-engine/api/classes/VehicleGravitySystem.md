[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleGravitySystem

# Class: VehicleGravitySystem

Defined in: [src/physics/VehicleGravitySystem.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L43)

Gravidade + snap ao chão por raycast para veículos cinemáticos (entidades
com `TransformComponent` + `KinematicBodyComponent`).

  1. Aplica `gravity` em `body.velocityY`.
  2. Integra `transform.y += velocityY * dt`.
  3. Raycast pra baixo contra `ground`. Se o veículo está caindo
     (`transform.y <= groundY`), gruda no terreno e zera `velocityY`
     (aterrissou). Subindo (pulo), ignora o hit — segue balístico.
  4. Se cair abaixo de `fallThreshold`, chama `onFallOff`.

Faz o veículo acompanhar a altura do relevo. NÃO inclina o chassi na rampa —
isso é efeito separado (suspensão), que fica a cargo do jogo.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new VehicleGravitySystem**(`ground`, `options?`): `VehicleGravitySystem`

Defined in: [src/physics/VehicleGravitySystem.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L58)

#### Parameters

##### ground

`Object3D`

##### options?

[`VehicleGravityOptions`](../interfaces/VehicleGravityOptions.md) = `{}`

#### Returns

`VehicleGravitySystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### priority

> **priority**: `number` = `5`

Defined in: [src/physics/VehicleGravitySystem.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L45)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`KinematicBodyComponent`](KinematicBodyComponent.md))[]

Defined in: [src/physics/VehicleGravitySystem.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L44)

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

Defined in: [src/physics/VehicleGravitySystem.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L71)

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
