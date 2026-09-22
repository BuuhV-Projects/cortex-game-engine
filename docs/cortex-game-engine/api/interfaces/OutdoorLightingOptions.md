[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / OutdoorLightingOptions

# Interface: OutdoorLightingOptions

Defined in: [src/scene/OutdoorLighting.ts:244](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L244)

Opções de [setupOutdoorLighting](../functions/setupOutdoorLighting.md). Todas opcionais — defaults "verão".

## Properties

### ambientIntensity?

> `optional` **ambientIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:258](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L258)

Intensidade do ambient (levanta as sombras sem matar contraste). Default `0.18`.

***

### csm?

> `optional` **csm?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:279](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L279)

Liga **Cascaded Shadow Maps** (estilo Unity, WebGPU): cascatas de sombra que
SEGUEM a câmera ativa — nítidas perto, cobertura longe, no mapa inteiro. Ideal pra
mundo aberto (substitui o frustum único do `shadowArea`). Default `false`.

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:260](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L260)

Exposição do tone mapping (ACES Filmic). Default `0.95`.

***

### ground?

> `optional` **ground?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:248](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L248)

Cor refletida do chão (base do hemisphere). Default `0xb6e2a8`.

***

### hemisphereIntensity?

> `optional` **hemisphereIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:256](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L256)

Intensidade do hemisphere (preenchimento azul-céu). Default `0.55`.

***

### lightMargin?

> `optional` **lightMargin?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:285](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L285)

Margem da luz do CSM (quão atrás da câmera o sol "vê" pra projetar). Default `200`.

***

### shadowArea?

> `optional` **shadowArea?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:269](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L269)

Meia-extensão do frustum de sombra (cobre `±area` em X/Z ao redor da
origem). Aumente pra cenas maiores; menor = sombras mais nítidas. Default `60`.

***

### shadowBias?

> `optional` **shadowBias?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:271](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L271)

Bias da sombra (combate shadow acne). Default `-0.0005`.

***

### shadowCascades?

> `optional` **shadowCascades?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:281](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L281)

Nº de cascatas (CSM). Mais = transição mais suave, mais custo. Default `3`.

***

### shadowCasterMinRatio?

> `optional` **shadowCasterMinRatio?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:295](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L295)

**Shadow caster culling por tamanho angular** (SPEC-0197, só com `csm`):
uma malha para de projetar sombra quando `raio / distância_da_câmera` fica
abaixo deste valor — a sombra dela ocuparia poucos pixels e não vale o draw
extra por cascata. Default `0.05` (some além de ~20× o próprio raio); `0`
desliga. Medido no `kart-racer`: 2807 → 1966 draws, sem diferença visível.

***

### shadowDistance?

> `optional` **shadowDistance?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:283](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L283)

Distância máxima de sombra (CSM, m) — além disso não há sombra. Default `250`.

***

### shadowFade?

> `optional` **shadowFade?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:287](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L287)

Suaviza a transição entre cascatas do CSM (tira a "linha de corte"). Default `true`.

***

### shadowMapSize?

> `optional` **shadowMapSize?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:264](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L264)

Resolução do shadow map (lado, em px). Default `2048`.

***

### shadowNormalBias?

> `optional` **shadowNormalBias?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:273](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L273)

Normal bias da sombra (combate peter-panning). Default `0.05`.

***

### shadows?

> `optional` **shadows?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:262](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L262)

Liga shadowMap + `sun.castShadow`. Default `true`.

***

### sky?

> `optional` **sky?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:246](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L246)

Cor do céu (topo do hemisphere). Default `0x9fd6ee`.

***

### sunColor?

> `optional` **sunColor?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:250](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L250)

Cor do sol. Default `0xfff2cc` (luz quente).

***

### sunIntensity?

> `optional` **sunIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:252](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L252)

Intensidade do sol. Default `3.2`.

***

### sunPosition?

> `optional` **sunPosition?**: \[`number`, `number`, `number`\]

Defined in: [src/scene/OutdoorLighting.ts:254](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L254)

Posição/direção do sol. Default `[35, 55, 25]`.
