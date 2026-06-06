[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FollowCamera2DSystem

# Class: FollowCamera2DSystem

Defined in: [src/systems/FollowCamera2DSystem.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L44)

Câmera de plataforma 2.5D: segue o alvo (entidade com
[FollowCameraTargetComponent](FollowCameraTargetComponent.md)) no **plano XY** (sobe/desce/lados), com
suavização, limites de enquadramento opcionais, um **roll opcional no eixo Z**
e um **pitch opcional no eixo X** (ambos travados em 0; o dev liga se quiser).
Olha o plano de uma `distance` no Z, o que dá o leve perspectivado
característico do 2.5D — o `pitch` reforça a profundidade/parallax.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new FollowCamera2DSystem**(`camera`, `options?`): `FollowCamera2DSystem`

Defined in: [src/systems/FollowCamera2DSystem.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L58)

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

> **priority**: `number` = `30`

Defined in: [src/systems/FollowCamera2DSystem.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L46)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`FollowCameraTargetComponent`](FollowCameraTargetComponent.md))[]

Defined in: [src/systems/FollowCamera2DSystem.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L45)

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

### getPitch()

> **getPitch**(): `number`

Defined in: [src/systems/FollowCamera2DSystem.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L87)

Pitch (X) atual da câmera, em radianos.

#### Returns

`number`

***

### getRoll()

> **getRoll**(): `number`

Defined in: [src/systems/FollowCamera2DSystem.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L77)

Roll (Z) atual da câmera, em radianos.

#### Returns

`number`

***

### setPitch()

> **setPitch**(`radians`): `void`

Defined in: [src/systems/FollowCamera2DSystem.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L82)

Muda o pitch (X) da câmera em runtime — tilt pra profundidade/parallax.

#### Parameters

##### radians

`number`

#### Returns

`void`

***

### setRoll()

> **setRoll**(`radians`): `void`

Defined in: [src/systems/FollowCamera2DSystem.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L72)

Muda o roll (Z) da câmera em runtime — o leve giro do 2.5D.

#### Parameters

##### radians

`number`

#### Returns

`void`

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/FollowCamera2DSystem.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FollowCamera2DSystem.ts#L91)

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
