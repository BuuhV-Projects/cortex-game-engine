[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / resolveAttachTransform

# Function: resolveAttachTransform()

> **resolveAttachTransform**(`target`, `targetAnchor`, `ownAnchor`, `own`): `object`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Kit.ts:136](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Kit.ts#L136)

Resolve o transform de um nó com `attach` (ADR-0053 §2): computa a pose que
faz o socket próprio (`ownAnchor`) **coincidir** com o socket do alvo
(`targetAnchor`), com as `dir` se encarando quando ambos são `connect`.

Matemática PURA (sem three) — unit-testável. Yaw-only por decisão: âncoras de
kit são autoradas no plano do chão; alinhar rotação completa em 3D exigiria
âncoras com frame completo, que o `kit.json` não tem.

## Parameters

### target

[`AttachPose`](../interfaces/AttachPose.md)

### targetAnchor

#### at

\[`number`, `number`, `number`\] = `vec3`

#### dir?

\[`number`, `number`, `number`\] = `...`

#### kind

`"surface"` \| `"connect"` = `...`

### ownAnchor

#### at

\[`number`, `number`, `number`\] = `vec3`

#### dir?

\[`number`, `number`, `number`\] = `...`

#### kind

`"surface"` \| `"connect"` = `...`

### own

#### rotationY

`number`

#### scale

[`Vec3`](../type-aliases/Vec3.md)

## Returns

`object`

### position

> **position**: [`Vec3`](../type-aliases/Vec3.md)

### rotationY

> **rotationY**: `number`
