[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / recordNativePipelineBirth

# Function: recordNativePipelineBirth()

> **recordNativePipelineBirth**(`object`, `material`, `ms`, `key`): `void`

Defined in: [src/core/PipelineBirthLog.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L70)

Records a pipeline born in the engine's own renderer (SPEC-0585), which calls the device directly
and so never goes through `backend.createRenderPipeline`. The trace drains it as
`nativePipelinesBorn`.

## Parameters

### object

`Object3D`

### material

`Material`

### ms

`number`

### key

`string`

## Returns

`void`
