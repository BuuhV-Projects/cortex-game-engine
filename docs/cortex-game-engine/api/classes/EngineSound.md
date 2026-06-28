[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EngineSound

# Class: EngineSound

Defined in: [src/scene/EngineSound.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L42)

**Som de motor em CAMADAS** (ADR-0081): faz crossfade entre faixas de RPM (low→mid→
high→veryhigh) e entre **com/sem acelerador** (on/off), como um motor de verdade — em
vez de um único loop com pitch. Todas as camadas tocam em loop simultâneo; o volume de
cada uma é cruzado por RPM e acelerador. Use um `THREE.Audio` por camada
(`audioManager.createSound(buf, { loop: true })`).

## Example

```ts
const eng = new EngineSound([
  { rpm: 0.0, on: onLow,  off: offLow },
  { rpm: 0.5, on: onMid,  off: offMid },
  { rpm: 1.0, on: onHigh, off: offHigh },
]);
eng.start(); // por frame: eng.update(speed/maxSpeed, throttle)
```

## Constructors

### Constructor

> **new EngineSound**(`layers`, `options?`): `EngineSound`

Defined in: [src/scene/EngineSound.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L45)

#### Parameters

##### layers

[`EngineLayer`](../interfaces/EngineLayer.md)[]

##### options?

[`EngineSoundOptions`](../interfaces/EngineSoundOptions.md) = `{}`

#### Returns

`EngineSound`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/EngineSound.ts:103](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L103)

Para e libera.

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [src/scene/EngineSound.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L58)

Toca todas as camadas em loop (volume 0; o [update](#update) faz o crossfade).

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/scene/EngineSound.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L66)

Pausa todas as camadas.

#### Returns

`void`

***

### update()

> **update**(`rpm`, `throttle`): `void`

Defined in: [src/scene/EngineSound.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L73)

Crossfade por `rpm` (0..1) + `throttle` (0..1). Chame por frame ao dirigir.

#### Parameters

##### rpm

`number`

##### throttle

`number`

#### Returns

`void`
