[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setPerfTraceGauge

# Function: setPerfTraceGauge()

> **setPerfTraceGauge**(`name`, `read`): `void`

Defined in: [src/core/PerfTrace.ts:152](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L152)

Registra um medidor do jogo lido a cada amostra do trace (`game.<name>`), ou o remove com `null`.
Serve para o kit de medição validar o que só o jogo sabe (ex.: câmera dentro da cidade, carros do
trânsito andando à vista).

## Parameters

### name

`string`

### read

(() => `number`) \| `null`

## Returns

`void`

## Example

```ts
setPerfTraceGauge('urban', () => (insideCity(camera.position) ? 1 : 0));
```
