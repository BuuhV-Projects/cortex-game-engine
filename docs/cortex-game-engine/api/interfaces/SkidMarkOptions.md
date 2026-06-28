[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SkidMarkOptions

# Interface: SkidMarkOptions

Defined in: [src/systems/SkidMarkSystem.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L10)

Opções do [SkidMarkSystem](../classes/SkidMarkSystem.md).

## Properties

### active?

> `optional` **active?**: () => `boolean`

Defined in: [src/systems/SkidMarkSystem.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L30)

Só roda quando `true` (ex.: `() => car.driving`). Default sempre.

#### Returns

`boolean`

***

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: [src/systems/SkidMarkSystem.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L12)

Cor das marcas. Default `0x161616` (borracha escura).

***

### lateralSlipThreshold?

> `optional` **lateralSlipThreshold?**: `number`

Defined in: [src/systems/SkidMarkSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L20)

Velocidade lateral (m/s) acima da qual marca (derrapagem/drift). Default 4.5.

***

### lift?

> `optional` **lift?**: `number`

Defined in: [src/systems/SkidMarkSystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L24)

Levanta a marca do chão (m) pra não brigar com o z. Default 0.03.

***

### maxSegments?

> `optional` **maxSegments?**: `number`

Defined in: [src/systems/SkidMarkSystem.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L18)

Máximo de segmentos (ring buffer — os mais antigos somem). Default 800.

***

### minSpeed?

> `optional` **minSpeed?**: `number`

Defined in: [src/systems/SkidMarkSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L22)

Abaixo desta velocidade (m/s) não marca. Default 2.

***

### opacity?

> `optional` **opacity?**: `number`

Defined in: [src/systems/SkidMarkSystem.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L14)

Opacidade. Default 0.55.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/systems/SkidMarkSystem.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L32)

Pausa total (ex.: editor).

#### Returns

`boolean`

***

### skidding?

> `optional` **skidding?**: () => `boolean`

Defined in: [src/systems/SkidMarkSystem.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L28)

Força a marca (ex.: freio de mão / freio forte): `() => brakeIn > 0.6`.

#### Returns

`boolean`

***

### wheels?

> `optional` **wheels?**: `number`[]

Defined in: [src/systems/SkidMarkSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L26)

Quais rodas marcam (índices). Default: todas.

***

### width?

> `optional` **width?**: `number`

Defined in: [src/systems/SkidMarkSystem.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L16)

Largura da marca (m). Default 0.28.
