[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / WaterOptions

# Interface: WaterOptions

Defined in: [src/scene/Water.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L14)

Opções de [Water](../classes/Water.md). Todas opcionais — os defaults dão uma água cartoon.

## Properties

### causticsIntensity?

> `optional` **causticsIntensity?**: `number`

Defined in: [src/scene/Water.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L38)

Intensidade do brilho das cáusticas (`emissiveIntensity`): a textura é usada
como `emissiveMap`, então áreas claras dela "acendem" a água puxando-a pro
branco. Default `0.35`.

***

### causticsUrl?

> `optional` **causticsUrl?**: `string`

Defined in: [src/scene/Water.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L26)

URL (relativa à raiz do projeto) de uma textura de cáusticas — o brilho
cintilante da luz no fundo da água. Carregada de forma assíncrona e aplicada
como `map` tiled quando pronta. Omita pra uma água lisa só com a cor base.

***

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: [src/scene/Water.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L20)

Cor base da água. Default azul-céu pastel (`0xa8d8f5`).

***

### flowSpeed?

> `optional` **flowSpeed?**: \[`number`, `number`\]

Defined in: [src/scene/Water.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L44)

Velocidade de deslize das cáusticas (offset/seg) em X e Y — dois eixos com
velocidades distintas dão um fluxo mais orgânico. `0` = parada. Requer
[Water.update](../classes/Water.md#update) no loop. Default `[0.012, 0.007]`.

***

### metalness?

> `optional` **metalness?**: `number`

Defined in: [src/scene/Water.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L32)

Metalicidade PBR. Default `0.05`.

***

### repeat?

> `optional` **repeat?**: `number`

Defined in: [src/scene/Water.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L28)

Repetições (tiling) da textura de cáusticas em cada eixo. Default `8`.

***

### roughness?

> `optional` **roughness?**: `number`

Defined in: [src/scene/Water.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L30)

Rugosidade PBR (0 = espelho, 1 = fosco). Default `0.35`.

***

### size?

> `optional` **size?**: `number`

Defined in: [src/scene/Water.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L16)

Lado do plano (quadrado), em unidades. Default `400`.

***

### y?

> `optional` **y?**: `number`

Defined in: [src/scene/Water.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L18)

Altura (Y) da superfície. Default `0`.
