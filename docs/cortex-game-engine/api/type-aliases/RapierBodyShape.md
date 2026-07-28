[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierBodyShape

# Type Alias: RapierBodyShape

> **RapierBodyShape** = \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: [`Vec3Like`](../interfaces/Vec3Like.md); `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}

Defined in: [.claude/worktrees/feat-input-rebind/src/components/RapierBodyComponent.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L8)

Forma do collider. `auto` deriva uma caixa do bounds do mesh (respeita escala).
