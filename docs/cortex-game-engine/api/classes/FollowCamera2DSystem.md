[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FollowCamera2DSystem

# Class: FollowCamera2DSystem

Defined in: [src/systems/FollowCamera2DSystem.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L35)

Câmera de plataforma 2.5D: segue o alvo (entidade com
[FollowCameraTargetComponent](FollowCameraTargetComponent.md)) no **plano XY** (sobe/desce/lados), com
suavização, limites de enquadramento opcionais e um **roll opcional no eixo Z**
(travado em 0; o dev liga se quiser). Olha o plano de uma `distance` no Z, o
que dá o leve perspectivado característico do 2.5D.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new FollowCamera2DSystem**(`camera`, `options?`): `FollowCamera2DSystem`

Defined in: [src/systems/FollowCamera2DSystem.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L48)

#### Parameters

##### camera

`PerspectiveCamera` \| `OrthographicCamera`

##### options?

[`FollowCamera2DOptions`](../interfaces/FollowCamera2DOptions.md) = `{}`

#### Returns

`FollowCamera2DSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### priority

> **priority**: `number` = `30`

Defined in: [src/systems/FollowCamera2DSystem.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L37)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`FollowCameraTargetComponent`](FollowCameraTargetComponent.md))[]

Defined in: [src/systems/FollowCamera2DSystem.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L36)

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

### setRoll()

> **setRoll**(`radians`): `void`

Defined in: [src/systems/FollowCamera2DSystem.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L61)

Muda o roll (Z) da câmera em runtime — o leve giro do 2.5D.

#### Parameters

##### radians

`number`

#### Returns

`void`

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/FollowCamera2DSystem.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L65)

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
