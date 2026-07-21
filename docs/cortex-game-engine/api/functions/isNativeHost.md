[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / isNativeHost

# Function: isNativeHost()

> **isNativeHost**(): `boolean`

Defined in: [src/scene/StaticMerge.ts:355](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L355)

Host nativo (export/console)? O shim de storage registra `__cortexReadUserFile`
só lá — no browser/Studio não existe. É onde o merge estático liga por default
(não há editor no host; no Studio o F2 precisa dos objetos individuais).

## Returns

`boolean`
