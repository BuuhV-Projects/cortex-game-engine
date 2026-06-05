[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / WaterOptions

# Interface: WaterOptions

Defined in: src/scene/Water.ts:14

Opções de [Water](../classes/Water.md). Todas opcionais — os defaults dão uma água cartoon.

## Properties

### causticsUrl?

> `optional` **causticsUrl?**: `string`

Defined in: src/scene/Water.ts:26

URL (relativa à raiz do projeto) de uma textura de cáusticas — o brilho
cintilante da luz no fundo da água. Carregada de forma assíncrona e aplicada
como `map` tiled quando pronta. Omita pra uma água lisa só com a cor base.

***

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: src/scene/Water.ts:20

Cor base da água. Default azul-céu pastel (`0xa8d8f5`).

***

### flowSpeed?

> `optional` **flowSpeed?**: `number`

Defined in: src/scene/Water.ts:38

Velocidade de deslize da textura de cáusticas (offset/seg), pra dar sensação
de movimento. `0` = parada. Requer chamar [Water.update](../classes/Water.md#update) no loop.
Default `0.015`.

***

### metalness?

> `optional` **metalness?**: `number`

Defined in: src/scene/Water.ts:32

Metalicidade PBR. Default `0.05`.

***

### repeat?

> `optional` **repeat?**: `number`

Defined in: src/scene/Water.ts:28

Repetições (tiling) da textura de cáusticas em cada eixo. Default `8`.

***

### roughness?

> `optional` **roughness?**: `number`

Defined in: src/scene/Water.ts:30

Rugosidade PBR (0 = espelho, 1 = fosco). Default `0.35`.

***

### size?

> `optional` **size?**: `number`

Defined in: src/scene/Water.ts:16

Lado do plano (quadrado), em unidades. Default `400`.

***

### y?

> `optional` **y?**: `number`

Defined in: src/scene/Water.ts:18

Altura (Y) da superfície. Default `0`.
