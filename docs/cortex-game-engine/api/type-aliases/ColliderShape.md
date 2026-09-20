[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ColliderShape

# Type Alias: ColliderShape

> **ColliderShape** = \{ `kind`: `"box"`; `offset?`: `Vec3`; `size`: `Vec3`; \} \| \{ `kind`: `"sphere"`; `offset?`: `Vec3`; `radius`: `number`; \} \| \{ `height`: `number`; `kind`: `"cylinder"`; `offset?`: `Vec3`; `radius`: `number`; \} \| \{ `height`: `number`; `kind`: `"capsule"`; `offset?`: `Vec3`; `radius`: `number`; \}

Defined in: [src/core/Physics.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L63)

Forma geométrica do collider (SPEC-0027).

Discriminated union por `kind`. Sphere é o caso mais simples; cylinder e
capsule são sempre **vertical-aligned** (eixo Y) — cobre 95% dos casos
de jogo 3D em terreno horizontal sem precisar de orientação arbitrária
(OBB rotacionada fica pra v2, após o RigidBody ganhar rotation).

`offset` desloca o centro do collider em relação a `RigidBodyComponent.position`.
