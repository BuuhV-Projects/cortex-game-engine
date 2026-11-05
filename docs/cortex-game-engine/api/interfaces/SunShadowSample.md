[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SunShadowSample

# Interface: SunShadowSample

Defined in: [src/core/PerfTrace.ts:169](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L169)

Campo `sunShadow`: redesenhos e devoluções do passe na janela, e a última recusa.

## Properties

### cascades?

> `optional` **cascades?**: [`SunShadowCascadeSample`](SunShadowCascadeSample.md)[]

Defined in: [src/core/PerfTrace.ts:176](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L176)

O último desenho de cada cascata da CSM nativa, na amostra em que algum valor mudou (SPEC-0690).

***

### counts?

> `optional` **counts?**: `string`

Defined in: [src/core/PerfTrace.ts:173](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L173)

***

### csmReceivers?

> `optional` **csmReceivers?**: `number`

Defined in: [src/core/PerfTrace.ts:178](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L178)

Draws nativos que amostraram a CSM na janela (SPEC-0690); ausente com zero.

***

### drawn

> **drawn**: `number`

Defined in: [src/core/PerfTrace.ts:170](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L170)

***

### handedBack

> **handedBack**: `number`

Defined in: [src/core/PerfTrace.ts:171](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L171)

***

### offender?

> `optional` **offender?**: [`ShadowOffender`](ShadowOffender.md)

Defined in: [src/core/PerfTrace.ts:174](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L174)

***

### pendingGeometry?

> `optional` **pendingGeometry?**: `number`

Defined in: [src/core/PerfTrace.ts:180](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L180)

Geometrias de caster ainda sem buffer no registro do passe, no último quadro (ADR-0692); ausente com zero.

***

### reason?

> `optional` **reason?**: `string`

Defined in: [src/core/PerfTrace.ts:172](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L172)
