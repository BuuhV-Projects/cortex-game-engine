[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ColliderShape2D

# Type Alias: ColliderShape2D

> **ColliderShape2D** = `"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"`

Defined in: [src/components/Collider2DComponent.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Collider2DComponent.ts#L17)

Forma do collider 2D do plataformer:
- `box` — retângulo AABB (`halfWidth`×`halfHeight`). Padrão.
- `circle` — círculo de raio `halfWidth` (bom pra pedras/bolas; `halfHeight`
  é ignorado).
- `capsule` — cápsula **vertical**: largura = `2·halfWidth` (raio = `halfWidth`),
  altura total = `2·halfHeight`, com tampas semicirculares de raio `halfWidth`
  (boa pro player escorregar em quinas). Se `halfHeight ≤ halfWidth`, vira um
  círculo.
- `heightfield` — **perfil de chão** por pontos (`points`): o player anda
  seguindo a curva (pontes arqueadas, morros, rampas). Floor one-way: pousa
  vindo de cima, atravessa por baixo. `halfWidth`/`halfHeight` viram só o bbox
  (broadphase), derivado dos pontos.
