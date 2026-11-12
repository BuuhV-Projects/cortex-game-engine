[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UnderwaterRipple

# Interface: UnderwaterRipple

Defined in: [src/core/underwater.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L12)

Ondulação da imagem em faixas horizontais.

## Properties

### amplitude?

> `optional` **amplitude?**: `number`

Defined in: [src/core/underwater.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L14)

Deslocamento horizontal máximo, em fração da largura da tela.

#### Default

```ts
0.00625 (4 px em 640)
```

***

### frequency?

> `optional` **frequency?**: `number`

Defined in: [src/core/underwater.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L16)

Fase por altura da tela, em radianos por altura de tela.

#### Default

```ts
17.92 (0,04 rad/px × 448 px)
```

***

### speed?

> `optional` **speed?**: `number`

Defined in: [src/core/underwater.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L18)

Fase por tempo, em radianos por segundo.

#### Default

```ts
1.5
```
