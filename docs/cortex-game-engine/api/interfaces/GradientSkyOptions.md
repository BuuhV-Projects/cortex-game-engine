[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GradientSkyOptions

# Interface: GradientSkyOptions

Defined in: [src/core/Skybox.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L39)

Opções do [Skybox.fromGradient](../classes/Skybox.md#fromgradient) (céu gradiente procedural).

## Properties

### bottom?

> `optional` **bottom?**: `string` \| `number`

Defined in: [src/core/Skybox.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L45)

Cor abaixo do horizonte (chão/IBL).

#### Default

```ts
'#8f8268'
```

***

### environmentIntensity?

> `optional` **environmentIntensity?**: `number`

Defined in: [src/core/Skybox.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L49)

Intensidade da luz que o céu lança (environment).

#### Default

```ts
1
```

***

### middle?

> `optional` **middle?**: `string` \| `number`

Defined in: [src/core/Skybox.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L43)

Cor do horizonte (meio).

#### Default

```ts
'#d6ecfb' (azul pálido)
```

***

### resolution?

> `optional` **resolution?**: `number`

Defined in: [src/core/Skybox.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L47)

Resolução vertical do gradiente.

#### Default

```ts
128
```

***

### top?

> `optional` **top?**: `string` \| `number`

Defined in: [src/core/Skybox.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L41)

Cor do zênite (topo).

#### Default

```ts
'#1f72d8' (azul forte)
```
