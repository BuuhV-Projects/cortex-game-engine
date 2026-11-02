[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EngineSound

# Class: EngineSound

Defined in: [src/scene/EngineSound.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L44)

**Som de motor com MARCHAS** (ADR-0081). Em vez de só cruzar volumes (que soa
artificial), o tom (playbackRate) **sobe com a rotação dentro da marcha e CAI ao trocar
de marcha** — a sensação de um carro acelerando e trocando o câmbio. As camadas (faixas
de RPM) dão variação de timbre: marchas baixas usam a amostra grave, altas a aguda. Faz
crossfade on/off (acelerador) e suaviza a troca de amostra (sem clique).

## Example

```ts
const eng = new EngineSound([
  { rpm: 0, on: onLow, off: offLow }, { rpm: 0.5, on: onMid, off: offMid }, { rpm: 1, on: onHigh, off: offHigh },
]);
eng.start(); // por frame: eng.update(speed/maxSpeed, throttle)
```

## Constructors

### Constructor

> **new EngineSound**(`layers`, `options?`): `EngineSound`

Defined in: [src/scene/EngineSound.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L48)

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

Defined in: [src/scene/EngineSound.ts:111](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L111)

Para e libera.

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [src/scene/EngineSound.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L60)

Toca todas as camadas em loop (volume 0; o [update](#update) controla).

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/scene/EngineSound.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L68)

Pausa todas as camadas.

#### Returns

`void`

***

### update()

> **update**(`speedRatio`, `throttle`): `void`

Defined in: [src/scene/EngineSound.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/EngineSound.ts#L75)

Atualiza por frame: `speedRatio` (0..1) define a marcha+rotação; `throttle` (0..1) o on/off.

#### Parameters

##### speedRatio

`number`

##### throttle

`number`

#### Returns

`void`
