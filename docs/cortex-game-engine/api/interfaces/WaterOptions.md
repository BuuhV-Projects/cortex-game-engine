[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / WaterOptions

# Interface: WaterOptions

Defined in: [src/scene/Water.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L19)

Opções de [Water](../classes/Water.md). Todas opcionais — os defaults dão uma água cartoon.

## Properties

### camera?

> `optional` **camera?**: `PerspectiveCamera` \| `OrthographicCamera`

Defined in: [src/scene/Water.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L71)

**Câmera pra seguir** (mar "infinito"): quando presente e [WaterOptions.follow](#follow)
está ligado, o plano re-centra no XZ da câmera a cada [Water.update](../classes/Water.md#update), então
a **borda quadrada** do plano fica sempre à mesma distância (`size / 2`) e some
atrás do fog — a água parece infinita mesmo sendo finita. As cáusticas ficam
ancoradas ao mundo (não escorregam com o plano). Omita pra uma água fixa.

***

### causticsIntensity?

> `optional` **causticsIntensity?**: `number`

Defined in: [src/scene/Water.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L57)

Intensidade do brilho das cáusticas (`emissiveIntensity`): a textura é usada
como `emissiveMap`, então áreas claras dela "acendem" a água puxando-a pro
branco. Default `0.35`.

***

### causticsUrl?

> `optional` **causticsUrl?**: `string`

Defined in: [src/scene/Water.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L45)

URL (relativa à raiz do projeto) de uma textura de cáusticas — o brilho
cintilante da luz no fundo da água. Carregada de forma assíncrona e aplicada
como `map` tiled quando pronta. Omita pra uma água lisa só com a cor base.

***

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: [src/scene/Water.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L39)

Cor base: `0xa8d8f5` no modo simples e `0x079dc2` no cartoon.

***

### flowSpeed?

> `optional` **flowSpeed?**: \[`number`, `number`\]

Defined in: [src/scene/Water.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L63)

Velocidade de deslize das cáusticas (offset/seg) em X e Y — dois eixos com
velocidades distintas dão um fluxo mais orgânico. `0` = parada. Requer
[Water.update](../classes/Water.md#update) no loop. Default `[0.012, 0.007]`.

***

### foamStrength?

> `optional` **foamStrength?**: `number`

Defined in: [src/scene/Water.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L29)

Intensidade da espuma nas margens e impactos, de 0 a 1. Default `0.7`.

***

### foamWidth?

> `optional` **foamWidth?**: `number`

Defined in: [src/scene/Water.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L31)

Alcance da espuma a partir do contato, em metros, maior que 0 até 5. Default `0.8`.

***

### follow?

> `optional` **follow?**: `boolean`

Defined in: [src/scene/Water.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L76)

Se o plano deve seguir a câmera (requer [WaterOptions.camera](#camera)). Default
`true` quando há câmera. Desligue pra um lago/poça fixo num ponto do mundo.

***

### metalness?

> `optional` **metalness?**: `number`

Defined in: [src/scene/Water.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L51)

Metalicidade PBR. Default `0.05`.

***

### repeat?

> `optional` **repeat?**: `number`

Defined in: [src/scene/Water.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L47)

Repetições (tiling) da textura de cáusticas em cada eixo. Default `8`.

***

### roughness?

> `optional` **roughness?**: `number`

Defined in: [src/scene/Water.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L49)

Rugosidade PBR (0 = espelho, 1 = fosco). Default `0.35`.

***

### segments?

> `optional` **segments?**: `number`

Defined in: [src/scene/Water.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L33)

Subdivisões por lado no modo cartoon, inteiro de 16 a 256. Default `128`.

***

### size?

> `optional` **size?**: `number`

Defined in: [src/scene/Water.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L35)

Lado do plano (quadrado), em unidades. Default `400`.

***

### style?

> `optional` **style?**: `"simple"` \| `"cartoon"`

Defined in: [src/scene/Water.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L21)

`simple` preserva o material original; `cartoon` ativa ondas e espuma na GPU.

***

### waveHeight?

> `optional` **waveHeight?**: `number`

Defined in: [src/scene/Water.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L23)

Amplitude máxima das ondas em metros, de 0 a 2. Default `0.18`.

***

### waveLength?

> `optional` **waveLength?**: `number`

Defined in: [src/scene/Water.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L25)

Comprimento da onda principal em metros, maior que zero. Default `16`.

***

### waveSpeed?

> `optional` **waveSpeed?**: `number`

Defined in: [src/scene/Water.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L27)

Multiplicador de velocidade das ondas, de 0 a 10. Default `1`.

***

### y?

> `optional` **y?**: `number`

Defined in: [src/scene/Water.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L37)

Altura (Y) da superfície. Default `0`.
