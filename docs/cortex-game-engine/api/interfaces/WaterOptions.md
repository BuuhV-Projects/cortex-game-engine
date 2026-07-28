[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / WaterOptions

# Interface: WaterOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L16)

Opções de [Water](../classes/Water.md). Todas opcionais — os defaults dão uma água cartoon.

## Properties

### camera?

> `optional` **camera?**: `OrthographicCamera` \| `PerspectiveCamera`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L54)

**Câmera pra seguir** (mar "infinito"): quando presente e [WaterOptions.follow](#follow)
está ligado, o plano re-centra no XZ da câmera a cada [Water.update](../classes/Water.md#update), então
a **borda quadrada** do plano fica sempre à mesma distância (`size / 2`) e some
atrás do fog — a água parece infinita mesmo sendo finita. As cáusticas ficam
ancoradas ao mundo (não escorregam com o plano). Omita pra uma água fixa.

***

### causticsIntensity?

> `optional` **causticsIntensity?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L40)

Intensidade do brilho das cáusticas (`emissiveIntensity`): a textura é usada
como `emissiveMap`, então áreas claras dela "acendem" a água puxando-a pro
branco. Default `0.35`.

***

### causticsUrl?

> `optional` **causticsUrl?**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L28)

URL (relativa à raiz do projeto) de uma textura de cáusticas — o brilho
cintilante da luz no fundo da água. Carregada de forma assíncrona e aplicada
como `map` tiled quando pronta. Omita pra uma água lisa só com a cor base.

***

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L22)

Cor base da água. Default azul-céu pastel (`0xa8d8f5`).

***

### flowSpeed?

> `optional` **flowSpeed?**: \[`number`, `number`\]

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L46)

Velocidade de deslize das cáusticas (offset/seg) em X e Y — dois eixos com
velocidades distintas dão um fluxo mais orgânico. `0` = parada. Requer
[Water.update](../classes/Water.md#update) no loop. Default `[0.012, 0.007]`.

***

### follow?

> `optional` **follow?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L59)

Se o plano deve seguir a câmera (requer [WaterOptions.camera](#camera)). Default
`true` quando há câmera. Desligue pra um lago/poça fixo num ponto do mundo.

***

### metalness?

> `optional` **metalness?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L34)

Metalicidade PBR. Default `0.05`.

***

### repeat?

> `optional` **repeat?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L30)

Repetições (tiling) da textura de cáusticas em cada eixo. Default `8`.

***

### roughness?

> `optional` **roughness?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L32)

Rugosidade PBR (0 = espelho, 1 = fosco). Default `0.35`.

***

### size?

> `optional` **size?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L18)

Lado do plano (quadrado), em unidades. Default `400`.

***

### y?

> `optional` **y?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Water.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L20)

Altura (Y) da superfície. Default `0`.
