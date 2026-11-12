[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UnderwaterState

# Interface: UnderwaterState

Defined in: [src/core/underwater.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L22)

O que o jogo pede a cada quadro em que a câmera está (ou está entrando) na água.

## Properties

### amount

> **amount**: `number`

Defined in: [src/core/underwater.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L24)

Intensidade 0..1. Com 0 o efeito desliga e não custa nada.

***

### blackDepth?

> `optional` **blackDepth?**: `number`

Defined in: [src/core/underwater.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L32)

Profundidade em que a tela fica preta, em metros.

#### Default

```ts
90
```

***

### color?

> `optional` **color?**: `string` \| `number`

Defined in: [src/core/underwater.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L26)

Cor da água em tela (sRGB), `0x5aaaaa` ou `'#5aaaaa'`.

#### Default

```ts
0x5aaaaa
```

***

### depth?

> `optional` **depth?**: `number`

Defined in: [src/core/underwater.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L30)

Metros da câmera abaixo da lâmina.

#### Default

```ts
0
```

***

### ripple?

> `optional` **ripple?**: `false` \| [`UnderwaterRipple`](UnderwaterRipple.md)

Defined in: [src/core/underwater.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L34)

Ondulação; `false` desliga.

#### Default

os valores de [UNDERWATER\_DEFAULTS](../variables/UNDERWATER_DEFAULTS.md)

***

### tint?

> `optional` **tint?**: `number`

Defined in: [src/core/underwater.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/underwater.ts#L28)

Quanto a cor da água cobre a imagem, 0..1.

#### Default

```ts
0.55
```
