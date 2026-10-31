[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / OutdoorLightingOptions

# Interface: OutdoorLightingOptions

Defined in: [src/scene/OutdoorLighting.ts:405](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L405)

Opções de [setupOutdoorLighting](../functions/setupOutdoorLighting.md). Todas opcionais — defaults "verão".

## Properties

### ambientIntensity?

> `optional` **ambientIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:419](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L419)

Intensidade do ambient (levanta as sombras sem matar contraste). Default `0.18`.

***

### csm?

> `optional` **csm?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:440](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L440)

Liga **Cascaded Shadow Maps** (estilo Unity, WebGPU): cascatas de sombra que
SEGUEM a câmera ativa — nítidas perto, cobertura longe, no mapa inteiro. Ideal pra
mundo aberto (substitui o frustum único do `shadowArea`). Default `false`.

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:421](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L421)

Exposição do tone mapping (ACES Filmic). Default `0.95`.

***

### ground?

> `optional` **ground?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:409](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L409)

Cor refletida do chão (base do hemisphere). Default `0xb6e2a8`.

***

### hemisphereIntensity?

> `optional` **hemisphereIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:417](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L417)

Intensidade do hemisphere (preenchimento azul-céu). Default `0.55`.

***

### lightMargin?

> `optional` **lightMargin?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:446](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L446)

Margem da luz do CSM (quão atrás da câmera o sol "vê" pra projetar). Default `200`.

***

### shadowArea?

> `optional` **shadowArea?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:430](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L430)

Meia-extensão do frustum de sombra (cobre `±area` em X/Z ao redor da
origem). Aumente pra cenas maiores; menor = sombras mais nítidas. Default `60`.

***

### shadowBias?

> `optional` **shadowBias?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:432](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L432)

Bias da sombra (combate shadow acne). Default `-0.0005`.

***

### shadowCascades?

> `optional` **shadowCascades?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:442](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L442)

Nº de cascatas (CSM). Mais = transição mais suave, mais custo. Default `3`.

***

### shadowCasterMinRatio?

> `optional` **shadowCasterMinRatio?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:456](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L456)

**Shadow caster culling por tamanho angular** (SPEC-0197, só com `csm`):
uma malha para de projetar sombra quando `raio / distância_da_câmera` fica
abaixo deste valor — a sombra dela ocuparia poucos pixels e não vale o draw
extra por cascata. Default `0.05` (some além de ~20× o próprio raio); `0`
desliga. Medido no `kart-racer`: 2807 → 1966 draws, sem diferença visível.

***

### shadowDistance?

> `optional` **shadowDistance?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:444](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L444)

Distância máxima de sombra (CSM, m) — além disso não há sombra. Default `250`.

***

### shadowFade?

> `optional` **shadowFade?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:448](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L448)

Suaviza a transição entre cascatas do CSM (tira a "linha de corte"). Default `true`.

***

### shadowMapSize?

> `optional` **shadowMapSize?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:425](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L425)

Resolução do shadow map (lado, em px). Default `2048`.

***

### shadowNormalBias?

> `optional` **shadowNormalBias?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:434](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L434)

Normal bias da sombra (combate peter-panning). Default `0.05`.

***

### shadows?

> `optional` **shadows?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:423](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L423)

Liga shadowMap + `sun.castShadow`. Default `true`.

***

### sky?

> `optional` **sky?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:407](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L407)

Cor do céu (topo do hemisphere). Default `0x9fd6ee`.

***

### sunColor?

> `optional` **sunColor?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:411](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L411)

Cor do sol. Default `0xfff2cc` (luz quente).

***

### sunIntensity?

> `optional` **sunIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:413](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L413)

Intensidade do sol. Default `3.2`.

***

### sunPosition?

> `optional` **sunPosition?**: \[`number`, `number`, `number`\]

Defined in: [src/scene/OutdoorLighting.ts:415](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L415)

Posição/direção do sol. Default `[35, 55, 25]`.
