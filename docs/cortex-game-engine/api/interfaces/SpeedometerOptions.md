[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SpeedometerOptions

# Interface: SpeedometerOptions

Defined in: [src/ui/Speedometer.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L16)

Opções do [Speedometer](../classes/Speedometer.md).

## Properties

### dialUrl?

> `optional` **dialUrl?**: `string`

Defined in: [src/ui/Speedometer.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L30)

Imagem do mostrador (override). Default a embutida.

***

### maxAngle?

> `optional` **maxAngle?**: `number`

Defined in: [src/ui/Speedometer.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L24)

Ângulo da agulha em `maxSpeed`. Default 390 (≈4h, varrendo por cima).

***

### maxSpeed?

> `optional` **maxSpeed?**: `number`

Defined in: [src/ui/Speedometer.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L18)

Velocidade (na unidade exibida) no ângulo máximo da agulha. Default 260 (= o mostrador).

***

### minAngle?

> `optional` **minAngle?**: `number`

Defined in: [src/ui/Speedometer.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L22)

Ângulo da agulha (graus CSS, horário+) em velocidade 0. Default 150 (≈8h).

***

### needleUrl?

> `optional` **needleUrl?**: `string`

Defined in: [src/ui/Speedometer.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L32)

Imagem da agulha (override). Default a embutida.

***

### parent?

> `optional` **parent?**: `HTMLElement`

Defined in: [src/ui/Speedometer.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L34)

Onde anexar. Default `document.body`.

***

### position?

> `optional` **position?**: `Partial`\<`Record`\<`"top"` \| `"bottom"` \| `"left"` \| `"right"`, `string`\>\>

Defined in: [src/ui/Speedometer.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L28)

Posição CSS do container. Default canto inferior direito.

***

### size?

> `optional` **size?**: `number`

Defined in: [src/ui/Speedometer.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L26)

Largura do widget (px). Default 220.

***

### units?

> `optional` **units?**: `"kmh"` \| `"mph"`

Defined in: [src/ui/Speedometer.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L20)

Unidade exibida e de conversão (m/s → kmh ×3.6 / mph ×2.237). Default 'kmh'.
