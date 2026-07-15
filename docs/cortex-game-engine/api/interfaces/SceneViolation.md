[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneViolation

# Interface: SceneViolation

Defined in: src/scene/validateScene.ts:20

**Validação geométrica ESTÁTICA da cena** (dados, sem three/GPU): detecta os
defeitos que custavam iterações de screenshot — interpenetração, peça
flutuando, gameplay tombado/desalinhado, gap impulável — a partir do JSON da
cena + `size`/anchors do `kit.json` + overlay do editor.

Regra de ouro do pipeline: geometria valida-se com CÓDIGO (barato, 100%
confiável); screenshot/crítica visual é pra composição e beleza, DEPOIS de
`errors` zerar. Regras destiladas do lint de fases (game-design-bible,
`ai-rules/fases-por-trechos.md`, R1–R5) generalizadas pro engine.

Convenção de pivô: nós `model` têm origem na BASE-centro (padrão dos kits —
`anchors.top` em `[0,h,0]`); `primitive`/`mesh` no CENTRO (BoxGeometry).

## Properties

### message

> **message**: `string`

Defined in: src/scene/validateScene.ts:26

***

### nodeId

> **nodeId**: `string`

Defined in: src/scene/validateScene.ts:24

***

### otherId?

> `optional` **otherId?**: `string`

Defined in: src/scene/validateScene.ts:25

***

### rule

> **rule**: `string`

Defined in: src/scene/validateScene.ts:22

`overlap | floating | tilted | misaligned | gap | rise | attach`

***

### severity

> **severity**: `"error"` \| `"warning"`

Defined in: src/scene/validateScene.ts:23
