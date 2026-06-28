[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SkidMarkOptions

# Interface: SkidMarkOptions

Defined in: src/systems/SkidMarkSystem.ts:10

Opções do [SkidMarkSystem](../classes/SkidMarkSystem.md).

## Properties

### active?

> `optional` **active?**: () => `boolean`

Defined in: src/systems/SkidMarkSystem.ts:30

Só roda quando `true` (ex.: `() => car.driving`). Default sempre.

#### Returns

`boolean`

***

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: src/systems/SkidMarkSystem.ts:12

Cor das marcas. Default `0x161616` (borracha escura).

***

### lateralSlipThreshold?

> `optional` **lateralSlipThreshold?**: `number`

Defined in: src/systems/SkidMarkSystem.ts:20

Velocidade lateral (m/s) acima da qual marca (derrapagem/drift). Default 4.5.

***

### lift?

> `optional` **lift?**: `number`

Defined in: src/systems/SkidMarkSystem.ts:24

Levanta a marca do chão (m) pra não brigar com o z. Default 0.03.

***

### maxSegments?

> `optional` **maxSegments?**: `number`

Defined in: src/systems/SkidMarkSystem.ts:18

Máximo de segmentos (ring buffer — os mais antigos somem). Default 800.

***

### minSpeed?

> `optional` **minSpeed?**: `number`

Defined in: src/systems/SkidMarkSystem.ts:22

Abaixo desta velocidade (m/s) não marca. Default 2.

***

### opacity?

> `optional` **opacity?**: `number`

Defined in: src/systems/SkidMarkSystem.ts:14

Opacidade. Default 0.55.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: src/systems/SkidMarkSystem.ts:32

Pausa total (ex.: editor).

#### Returns

`boolean`

***

### skidding?

> `optional` **skidding?**: () => `boolean`

Defined in: src/systems/SkidMarkSystem.ts:28

Força a marca (ex.: freio de mão / freio forte): `() => brakeIn > 0.6`.

#### Returns

`boolean`

***

### wheels?

> `optional` **wheels?**: `number`[]

Defined in: src/systems/SkidMarkSystem.ts:26

Quais rodas marcam (índices). Default: todas.

***

### width?

> `optional` **width?**: `number`

Defined in: src/systems/SkidMarkSystem.ts:16

Largura da marca (m). Default 0.28.
