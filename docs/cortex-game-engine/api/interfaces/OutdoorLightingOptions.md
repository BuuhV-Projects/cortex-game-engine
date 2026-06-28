[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / OutdoorLightingOptions

# Interface: OutdoorLightingOptions

Defined in: [src/scene/OutdoorLighting.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L15)

Opções de [setupOutdoorLighting](../functions/setupOutdoorLighting.md). Todas opcionais — defaults "verão".

## Properties

### ambientIntensity?

> `optional` **ambientIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L29)

Intensidade do ambient (levanta as sombras sem matar contraste). Default `0.18`.

***

### csm?

> `optional` **csm?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L50)

Liga **Cascaded Shadow Maps** (estilo Unity, WebGPU): cascatas de sombra que
SEGUEM a câmera ativa — nítidas perto, cobertura longe, no mapa inteiro. Ideal pra
mundo aberto (substitui o frustum único do `shadowArea`). Default `false`.

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L31)

Exposição do tone mapping (ACES Filmic). Default `0.95`.

***

### ground?

> `optional` **ground?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L19)

Cor refletida do chão (base do hemisphere). Default `0xb6e2a8`.

***

### hemisphereIntensity?

> `optional` **hemisphereIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L27)

Intensidade do hemisphere (preenchimento azul-céu). Default `0.55`.

***

### lightMargin?

> `optional` **lightMargin?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L56)

Margem da luz do CSM (quão atrás da câmera o sol "vê" pra projetar). Default `200`.

***

### shadowArea?

> `optional` **shadowArea?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L40)

Meia-extensão do frustum de sombra (cobre `±area` em X/Z ao redor da
origem). Aumente pra cenas maiores; menor = sombras mais nítidas. Default `60`.

***

### shadowBias?

> `optional` **shadowBias?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L42)

Bias da sombra (combate shadow acne). Default `-0.0005`.

***

### shadowCascades?

> `optional` **shadowCascades?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L52)

Nº de cascatas (CSM). Mais = transição mais suave, mais custo. Default `3`.

***

### shadowDistance?

> `optional` **shadowDistance?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L54)

Distância máxima de sombra (CSM, m) — além disso não há sombra. Default `250`.

***

### shadowMapSize?

> `optional` **shadowMapSize?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L35)

Resolução do shadow map (lado, em px). Default `2048`.

***

### shadowNormalBias?

> `optional` **shadowNormalBias?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L44)

Normal bias da sombra (combate peter-panning). Default `0.05`.

***

### shadows?

> `optional` **shadows?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L33)

Liga shadowMap + `sun.castShadow`. Default `true`.

***

### sky?

> `optional` **sky?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L17)

Cor do céu (topo do hemisphere). Default `0x9fd6ee`.

***

### sunColor?

> `optional` **sunColor?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L21)

Cor do sol. Default `0xfff2cc` (luz quente).

***

### sunIntensity?

> `optional` **sunIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L23)

Intensidade do sol. Default `3.2`.

***

### sunPosition?

> `optional` **sunPosition?**: \[`number`, `number`, `number`\]

Defined in: [src/scene/OutdoorLighting.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L25)

Posição/direção do sol. Default `[35, 55, 25]`.
