[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RapierBodyOptions

# Interface: RapierBodyOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/components/RapierBodyComponent.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L15)

Opções do [RapierBodyComponent](../classes/RapierBodyComponent.md).

## Properties

### bodyType?

> `optional` **bodyType?**: [`RapierBodyType`](../type-aliases/RapierBodyType.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/components/RapierBodyComponent.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L21)

`dynamic` cai/é empurrado; `fixed` é imóvel (chão/parede); `kinematic` você move.
Default `dynamic`. (Não se chama `type` porque a base [Component](../classes/Component.md) usa `type`
como chave do ECS — campo `type` sombrearia o getter.)

***

### friction?

> `optional` **friction?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/RapierBodyComponent.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L27)

Atrito.

***

### isSensor?

> `optional` **isSensor?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/RapierBodyComponent.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L29)

`true` = trigger (detecta sobreposição mas NÃO bloqueia).

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/RapierBodyComponent.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L25)

Quão "quicante" (0 = não quica).

***

### shape?

> `optional` **shape?**: [`RapierBodyShape`](../type-aliases/RapierBodyShape.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/components/RapierBodyComponent.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/RapierBodyComponent.ts#L23)

Forma do collider. Default `{ kind: 'auto' }` (caixa do bounds).
