[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ColliderShape2D

# Type Alias: ColliderShape2D

> **ColliderShape2D** = `"box"` \| `"circle"` \| `"capsule"`

Defined in: [src/components/Collider2DComponent.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L13)

Forma do collider 2D do plataformer:
- `box` — retângulo AABB (`halfWidth`×`halfHeight`). Padrão.
- `circle` — círculo de raio `halfWidth` (bom pra pedras/bolas; `halfHeight`
  é ignorado).
- `capsule` — cápsula **vertical**: largura = `2·halfWidth` (raio = `halfWidth`),
  altura total = `2·halfHeight`, com tampas semicirculares de raio `halfWidth`
  (boa pro player escorregar em quinas). Se `halfHeight ≤ halfWidth`, vira um
  círculo.
