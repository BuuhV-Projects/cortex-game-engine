[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / OutdoorLightingOptions

# Interface: OutdoorLightingOptions

Defined in: [src/scene/OutdoorLighting.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L19)

Opções de [setupOutdoorLighting](../functions/setupOutdoorLighting.md). Todas opcionais — defaults "verão".

## Properties

### ambientIntensity?

> `optional` **ambientIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L33)

Intensidade do ambient (levanta as sombras sem matar contraste). Default `0.18`.

***

### csm?

> `optional` **csm?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L54)

Liga **Cascaded Shadow Maps** (estilo Unity, WebGPU): cascatas de sombra que
SEGUEM a câmera ativa — nítidas perto, cobertura longe, no mapa inteiro. Ideal pra
mundo aberto (substitui o frustum único do `shadowArea`). Default `false`.

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L35)

Exposição do tone mapping (ACES Filmic). Default `0.95`.

***

### ground?

> `optional` **ground?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L23)

Cor refletida do chão (base do hemisphere). Default `0xb6e2a8`.

***

### hemisphereIntensity?

> `optional` **hemisphereIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L31)

Intensidade do hemisphere (preenchimento azul-céu). Default `0.55`.

***

### lightMargin?

> `optional` **lightMargin?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L60)

Margem da luz do CSM (quão atrás da câmera o sol "vê" pra projetar). Default `200`.

***

### shadowArea?

> `optional` **shadowArea?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L44)

Meia-extensão do frustum de sombra (cobre `±area` em X/Z ao redor da
origem). Aumente pra cenas maiores; menor = sombras mais nítidas. Default `60`.

***

### shadowBias?

> `optional` **shadowBias?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L46)

Bias da sombra (combate shadow acne). Default `-0.0005`.

***

### shadowCascades?

> `optional` **shadowCascades?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L56)

Nº de cascatas (CSM). Mais = transição mais suave, mais custo. Default `3`.

***

### shadowCasterMinRatio?

> `optional` **shadowCasterMinRatio?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L70)

**Shadow caster culling por tamanho angular** (SPEC-0197, só com `csm`):
uma malha para de projetar sombra quando `raio / distância_da_câmera` fica
abaixo deste valor — a sombra dela ocuparia poucos pixels e não vale o draw
extra por cascata. Default `0.05` (some além de ~20× o próprio raio); `0`
desliga. Medido no `kart-racer`: 2807 → 1966 draws, sem diferença visível.

***

### shadowDistance?

> `optional` **shadowDistance?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L58)

Distância máxima de sombra (CSM, m) — além disso não há sombra. Default `250`.

***

### shadowFade?

> `optional` **shadowFade?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L62)

Suaviza a transição entre cascatas do CSM (tira a "linha de corte"). Default `true`.

***

### shadowFarCascadeInterval?

> `optional` **shadowFarCascadeInterval?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L76)

**CSM escalonado** (SPEC-0675, só com `csm`, só sem o passe de sombra nativo — Studio/navegador): a cascata 0
redesenha todo quadro e as distantes a cada N quadros, revezando. Objeto andando longe atrasa até N − 1 quadros
na sombra; o estático não muda. `1` redesenha todas todo quadro. Default `2`.

***

### shadowMapSize?

> `optional` **shadowMapSize?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L39)

Resolução do shadow map (lado, em px). Default `2048`.

***

### shadowNormalBias?

> `optional` **shadowNormalBias?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L48)

Normal bias da sombra (combate peter-panning). Default `0.05`.

***

### shadows?

> `optional` **shadows?**: `boolean`

Defined in: [src/scene/OutdoorLighting.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L37)

Liga shadowMap + `sun.castShadow`. Default `true`.

***

### sky?

> `optional` **sky?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L21)

Cor do céu (topo do hemisphere). Default `0x9fd6ee`.

***

### sunColor?

> `optional` **sunColor?**: `ColorRepresentation`

Defined in: [src/scene/OutdoorLighting.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L25)

Cor do sol. Default `0xfff2cc` (luz quente).

***

### sunIntensity?

> `optional` **sunIntensity?**: `number`

Defined in: [src/scene/OutdoorLighting.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L27)

Intensidade do sol. Default `3.2`.

***

### sunPosition?

> `optional` **sunPosition?**: \[`number`, `number`, `number`\]

Defined in: [src/scene/OutdoorLighting.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L29)

Posição/direção do sol. Default `[35, 55, 25]`.
