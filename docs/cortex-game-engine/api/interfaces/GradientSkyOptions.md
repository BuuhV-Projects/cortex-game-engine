[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GradientSkyOptions

# Interface: GradientSkyOptions

Defined in: [src/core/Skybox.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L52)

Opções do [Skybox.fromGradient](../classes/Skybox.md#fromgradient) (céu gradiente procedural).

## Properties

### bottom?

> `optional` **bottom?**: `string` \| `number`

Defined in: [src/core/Skybox.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L58)

Cor abaixo do horizonte (chão/IBL).

#### Default

```ts
'#8f8268'
```

***

### environmentIntensity?

> `optional` **environmentIntensity?**: `number`

Defined in: [src/core/Skybox.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L62)

Intensidade da luz que o céu lança (environment).

#### Default

```ts
1
```

***

### middle?

> `optional` **middle?**: `string` \| `number`

Defined in: [src/core/Skybox.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L56)

Cor do horizonte (meio).

#### Default

```ts
'#d6ecfb' (azul pálido)
```

***

### resolution?

> `optional` **resolution?**: `number`

Defined in: [src/core/Skybox.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L60)

Resolução vertical do gradiente.

#### Default

```ts
128
```

***

### top?

> `optional` **top?**: `string` \| `number`

Defined in: [src/core/Skybox.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L54)

Cor do zênite (topo).

#### Default

```ts
'#1f72d8' (azul forte)
```
