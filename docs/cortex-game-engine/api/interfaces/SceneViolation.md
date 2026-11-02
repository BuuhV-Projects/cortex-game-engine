[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneViolation

# Interface: SceneViolation

Defined in: [src/scene/validateScene.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L20)

**Validação geométrica ESTÁTICA da cena** (dados, sem three/GPU): detecta os
defeitos que custavam iterações de screenshot — interpenetração, peça
flutuando, gameplay tombado/desalinhado, gap impulável — a partir do JSON da
cena + `size`/anchors do `kit.json` + overlay do editor.

Regra de ouro do pipeline: geometria valida-se com CÓDIGO (barato, 100%
confiável); screenshot/crítica visual é pra composição e beleza, DEPOIS de
`errors` zerar. Regras destiladas do lint de fases da skill `fase-por-trechos`
(R1–R5) e generalizadas pro engine.

Convenção de pivô: nós `model` têm origem na BASE-centro (padrão dos kits —
`anchors.top` em `[0,h,0]`); `primitive`/`mesh` no CENTRO (BoxGeometry).

## Properties

### message

> **message**: `string`

Defined in: [src/scene/validateScene.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L26)

***

### nodeId

> **nodeId**: `string`

Defined in: [src/scene/validateScene.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L24)

***

### otherId?

> `optional` **otherId?**: `string`

Defined in: [src/scene/validateScene.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L25)

***

### rule

> **rule**: `string`

Defined in: [src/scene/validateScene.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L22)

`overlap | floating | tilted | misaligned | gap | rise | attach`

***

### severity

> **severity**: `"error"` \| `"warning"`

Defined in: [src/scene/validateScene.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L23)
