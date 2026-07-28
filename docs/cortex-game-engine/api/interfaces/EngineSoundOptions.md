[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EngineSoundOptions

# Interface: EngineSoundOptions

Defined in: [src/scene/EngineSound.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L17)

Opções do [EngineSound](../classes/EngineSound.md).

## Properties

### gears?

> `optional` **gears?**: `number`

Defined in: [src/scene/EngineSound.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L19)

Nº de "marchas" — o tom sobe dentro da marcha e CAI ao trocar (sensação de câmbio). Default 5.

***

### idleRate?

> `optional` **idleRate?**: `number`

Defined in: [src/scene/EngineSound.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L21)

Pitch no início / fim de cada marcha (rotação baixa → corte). Default 0.8 / 1.6.

***

### maxRate?

> `optional` **maxRate?**: `number`

Defined in: [src/scene/EngineSound.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L22)

***

### volume?

> `optional` **volume?**: `number`

Defined in: [src/scene/EngineSound.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L24)

Volume mestre. Default 0.9.

***

### volumeSmooth?

> `optional` **volumeSmooth?**: `number`

Defined in: [src/scene/EngineSound.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L26)

Suavização do volume entre camadas (0..1 por frame) — evita clique na troca. Default 0.25.
