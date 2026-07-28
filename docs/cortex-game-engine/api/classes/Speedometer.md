[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Speedometer

# Class: Speedometer

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/Speedometer.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L37)

## Constructors

### Constructor

> **new Speedometer**(`options?`): `Speedometer`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/Speedometer.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L47)

#### Parameters

##### options?

[`SpeedometerOptions`](../interfaces/SpeedometerOptions.md) = `{}`

#### Returns

`Speedometer`

## Properties

### el

> `readonly` **el**: `HTMLDivElement`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/Speedometer.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L39)

O container do widget (pra estilizar/posicionar por fora se quiser).

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/Speedometer.ts:127](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L127)

Remove o widget do DOM.

#### Returns

`void`

***

### setVisible()

> **setVisible**(`visible`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/Speedometer.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L122)

Mostra/esconde o velocímetro (ex.: só ao dirigir).

#### Parameters

##### visible

`boolean`

#### Returns

`void`

***

### update()

> **update**(`speedMetersPerSecond`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/Speedometer.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/Speedometer.ts#L110)

Atualiza a agulha + o texto a partir da velocidade em **m/s**.

#### Parameters

##### speedMetersPerSecond

`number`

#### Returns

`void`
