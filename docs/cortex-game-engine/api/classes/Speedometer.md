[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Speedometer

# Class: Speedometer

Defined in: src/ui/Speedometer.ts:37

## Constructors

### Constructor

> **new Speedometer**(`options?`): `Speedometer`

Defined in: src/ui/Speedometer.ts:47

#### Parameters

##### options?

[`SpeedometerOptions`](../interfaces/SpeedometerOptions.md) = `{}`

#### Returns

`Speedometer`

## Properties

### el

> `readonly` **el**: `HTMLDivElement`

Defined in: src/ui/Speedometer.ts:39

O container do widget (pra estilizar/posicionar por fora se quiser).

## Methods

### dispose()

> **dispose**(): `void`

Defined in: src/ui/Speedometer.ts:125

Remove o widget do DOM.

#### Returns

`void`

***

### setVisible()

> **setVisible**(`visible`): `void`

Defined in: src/ui/Speedometer.ts:120

Mostra/esconde o velocímetro (ex.: só ao dirigir).

#### Parameters

##### visible

`boolean`

#### Returns

`void`

***

### update()

> **update**(`speedMetersPerSecond`): `void`

Defined in: src/ui/Speedometer.ts:110

Atualiza a agulha + o texto a partir da velocidade em **m/s**.

#### Parameters

##### speedMetersPerSecond

`number`

#### Returns

`void`
