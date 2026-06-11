[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierBodyShape

# Type Alias: RapierBodyShape

> **RapierBodyShape** = \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: [`Vec3Like`](../interfaces/Vec3Like.md); `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}

Defined in: src/components/RapierBodyComponent.ts:8

Forma do collider. `auto` deriva uma caixa do bounds do mesh (respeita escala).
