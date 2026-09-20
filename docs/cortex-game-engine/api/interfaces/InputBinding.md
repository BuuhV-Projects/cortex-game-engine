[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InputBinding

# Interface: InputBinding

Defined in: [src/input/bindings.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/bindings.ts#L27)

Uma origem física que ativa uma ação.

## Properties

### index?

> `readonly` `optional` **index?**: `number`

Defined in: [src/input/bindings.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/bindings.ts#L30)

Botão/eixo (`pad`, `axis`, `mouse`) — ignorado quando `source` é `key`.

***

### key?

> `readonly` `optional` **key?**: `string`

Defined in: [src/input/bindings.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/bindings.ts#L32)

Tecla (`KeyboardEvent.key` normalizado) — só quando `source` é `key`.

***

### sign?

> `readonly` `optional` **sign?**: `1` \| `-1`

Defined in: [src/input/bindings.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/bindings.ts#L34)

Sentido do eixo: `+1` ou `-1` — só quando `source` é `axis`.

***

### source

> `readonly` **source**: [`BindingSource`](../type-aliases/BindingSource.md)

Defined in: [src/input/bindings.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/bindings.ts#L28)
