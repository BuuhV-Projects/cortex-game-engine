[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UnderwaterPass

# Class: UnderwaterPass

Defined in: src/core/UnderwaterPass.ts:50

## Constructors

### Constructor

> **new UnderwaterPass**(): `UnderwaterPass`

#### Returns

`UnderwaterPass`

## Accessors

### state

#### Get Signature

> **get** **state**(): `Readonly`\<[`ResolvedUnderwater`](../interfaces/ResolvedUnderwater.md)\> \| `null`

Defined in: src/core/UnderwaterPass.ts:59

Estado aplicado, ou `null` com o efeito desligado.

##### Returns

`Readonly`\<[`ResolvedUnderwater`](../interfaces/ResolvedUnderwater.md)\> \| `null`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: src/core/UnderwaterPass.ts:114

Libera o pipeline e a RT da cena. O estado continua (volta a criar no próximo uso).

#### Returns

`void`

***

### render()

> **render**(`renderer`, `scene`, `camera`): `boolean`

Defined in: src/core/UnderwaterPass.ts:82

Desenha a cena pelo caminho embaixo d'água, se ele está ligado no navegador.
Devolve `false` quando o chamador deve desenhar do jeito normal (desligado,
ou no host nativo, onde o efeito é do blit do host).

#### Parameters

##### renderer

`WebGPURenderer`

##### scene

`Scene`

##### camera

`Camera`

#### Returns

`boolean`

***

### set()

> **set**(`state`): `void`

Defined in: src/core/UnderwaterPass.ts:64

Liga, ajusta ou desliga (`null` / `amount ≤ 0`). Pode ser chamado todo quadro.

#### Parameters

##### state

[`UnderwaterState`](../interfaces/UnderwaterState.md) \| `null`

#### Returns

`void`

***

### uniforms()

> **uniforms**(): [`UnderwaterUniforms`](../interfaces/UnderwaterUniforms.md)

Defined in: src/core/UnderwaterPass.ts:96

Uniforms TSL do efeito (criados na primeira chamada), para montar o mesmo
efeito dentro de outro grafo, como o do `PostFX`.

#### Returns

[`UnderwaterUniforms`](../interfaces/UnderwaterUniforms.md)
