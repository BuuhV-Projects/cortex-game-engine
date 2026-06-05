[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / OutdoorLightingOptions

# Interface: OutdoorLightingOptions

Defined in: src/scene/OutdoorLighting.ts:14

Opções de [setupOutdoorLighting](../functions/setupOutdoorLighting.md). Todas opcionais — defaults "verão".

## Properties

### ambientIntensity?

> `optional` **ambientIntensity?**: `number`

Defined in: src/scene/OutdoorLighting.ts:28

Intensidade do ambient (levanta as sombras sem matar contraste). Default `0.18`.

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: src/scene/OutdoorLighting.ts:30

Exposição do tone mapping (ACES Filmic). Default `0.95`.

***

### ground?

> `optional` **ground?**: `ColorRepresentation`

Defined in: src/scene/OutdoorLighting.ts:18

Cor refletida do chão (base do hemisphere). Default `0xb6e2a8`.

***

### hemisphereIntensity?

> `optional` **hemisphereIntensity?**: `number`

Defined in: src/scene/OutdoorLighting.ts:26

Intensidade do hemisphere (preenchimento azul-céu). Default `0.55`.

***

### shadowArea?

> `optional` **shadowArea?**: `number`

Defined in: src/scene/OutdoorLighting.ts:39

Meia-extensão do frustum de sombra (cobre `±area` em X/Z ao redor da
origem). Aumente pra cenas maiores; menor = sombras mais nítidas. Default `60`.

***

### shadowBias?

> `optional` **shadowBias?**: `number`

Defined in: src/scene/OutdoorLighting.ts:41

Bias da sombra (combate shadow acne). Default `-0.0005`.

***

### shadowMapSize?

> `optional` **shadowMapSize?**: `number`

Defined in: src/scene/OutdoorLighting.ts:34

Resolução do shadow map (lado, em px). Default `2048`.

***

### shadowNormalBias?

> `optional` **shadowNormalBias?**: `number`

Defined in: src/scene/OutdoorLighting.ts:43

Normal bias da sombra (combate peter-panning). Default `0.05`.

***

### shadows?

> `optional` **shadows?**: `boolean`

Defined in: src/scene/OutdoorLighting.ts:32

Liga shadowMap + `sun.castShadow`. Default `true`.

***

### sky?

> `optional` **sky?**: `ColorRepresentation`

Defined in: src/scene/OutdoorLighting.ts:16

Cor do céu (topo do hemisphere). Default `0x9fd6ee`.

***

### sunColor?

> `optional` **sunColor?**: `ColorRepresentation`

Defined in: src/scene/OutdoorLighting.ts:20

Cor do sol. Default `0xfff2cc` (luz quente).

***

### sunIntensity?

> `optional` **sunIntensity?**: `number`

Defined in: src/scene/OutdoorLighting.ts:22

Intensidade do sol. Default `3.2`.

***

### sunPosition?

> `optional` **sunPosition?**: \[`number`, `number`, `number`\]

Defined in: src/scene/OutdoorLighting.ts:24

Posição/direção do sol. Default `[35, 55, 25]`.
