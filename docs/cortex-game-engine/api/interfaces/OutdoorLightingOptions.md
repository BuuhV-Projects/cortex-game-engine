[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / OutdoorLightingOptions

# Interface: OutdoorLightingOptions

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L69)

Opções de [setupOutdoorLighting](../functions/setupOutdoorLighting.md). Todas opcionais — defaults "verão".

## Properties

### ambientIntensity?

> `optional` **ambientIntensity?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L83)

Intensidade do ambient (levanta as sombras sem matar contraste). Default `0.18`.

***

### csm?

> `optional` **csm?**: `boolean`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L104)

Liga **Cascaded Shadow Maps** (estilo Unity, WebGPU): cascatas de sombra que
SEGUEM a câmera ativa — nítidas perto, cobertura longe, no mapa inteiro. Ideal pra
mundo aberto (substitui o frustum único do `shadowArea`). Default `false`.

***

### exposure?

> `optional` **exposure?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L85)

Exposição do tone mapping (ACES Filmic). Default `0.95`.

***

### ground?

> `optional` **ground?**: `ColorRepresentation`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L73)

Cor refletida do chão (base do hemisphere). Default `0xb6e2a8`.

***

### hemisphereIntensity?

> `optional` **hemisphereIntensity?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L81)

Intensidade do hemisphere (preenchimento azul-céu). Default `0.55`.

***

### lightMargin?

> `optional` **lightMargin?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L110)

Margem da luz do CSM (quão atrás da câmera o sol "vê" pra projetar). Default `200`.

***

### shadowArea?

> `optional` **shadowArea?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L94)

Meia-extensão do frustum de sombra (cobre `±area` em X/Z ao redor da
origem). Aumente pra cenas maiores; menor = sombras mais nítidas. Default `60`.

***

### shadowBias?

> `optional` **shadowBias?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L96)

Bias da sombra (combate shadow acne). Default `-0.0005`.

***

### shadowCascades?

> `optional` **shadowCascades?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L106)

Nº de cascatas (CSM). Mais = transição mais suave, mais custo. Default `3`.

***

### shadowCasterMinRatio?

> `optional` **shadowCasterMinRatio?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L120)

**Shadow caster culling por tamanho angular** (SPEC-0197, só com `csm`):
uma malha para de projetar sombra quando `raio / distância_da_câmera` fica
abaixo deste valor — a sombra dela ocuparia poucos pixels e não vale o draw
extra por cascata. Default `0.05` (some além de ~20× o próprio raio); `0`
desliga. Medido no `kart-racer`: 2807 → 1966 draws, sem diferença visível.

***

### shadowDistance?

> `optional` **shadowDistance?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:108](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L108)

Distância máxima de sombra (CSM, m) — além disso não há sombra. Default `250`.

***

### shadowFade?

> `optional` **shadowFade?**: `boolean`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L112)

Suaviza a transição entre cascatas do CSM (tira a "linha de corte"). Default `true`.

***

### shadowMapSize?

> `optional` **shadowMapSize?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L89)

Resolução do shadow map (lado, em px). Default `2048`.

***

### shadowNormalBias?

> `optional` **shadowNormalBias?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L98)

Normal bias da sombra (combate peter-panning). Default `0.05`.

***

### shadows?

> `optional` **shadows?**: `boolean`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L87)

Liga shadowMap + `sun.castShadow`. Default `true`.

***

### sky?

> `optional` **sky?**: `ColorRepresentation`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L71)

Cor do céu (topo do hemisphere). Default `0x9fd6ee`.

***

### sunColor?

> `optional` **sunColor?**: `ColorRepresentation`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L75)

Cor do sol. Default `0xfff2cc` (luz quente).

***

### sunIntensity?

> `optional` **sunIntensity?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L77)

Intensidade do sol. Default `3.2`.

***

### sunPosition?

> `optional` **sunPosition?**: \[`number`, `number`, `number`\]

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/OutdoorLighting.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/OutdoorLighting.ts#L79)

Posição/direção do sol. Default `[35, 55, 25]`.
