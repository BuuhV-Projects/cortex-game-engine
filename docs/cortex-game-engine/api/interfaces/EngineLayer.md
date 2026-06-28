[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EngineLayer

# Interface: EngineLayer

Defined in: [src/scene/EngineSound.ts:7](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L7)

Uma camada do motor: o pico em `rpm` (0..1) com som **com acelerador** (`on`) e/ou
**sem** (`off`). Ambos em loop. Camadas faltando são ignoradas.

## Properties

### off?

> `optional` **off?**: `Audio`\<`GainNode`\>

Defined in: [src/scene/EngineSound.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L13)

Som desacelerando / sem acelerador (loop).

***

### on?

> `optional` **on?**: `Audio`\<`GainNode`\>

Defined in: [src/scene/EngineSound.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L11)

Som com acelerador (loop).

***

### rpm

> **rpm**: `number`

Defined in: [src/scene/EngineSound.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L9)

RPM normalizado (0..1) — usado pra ordenar (low→high).
