[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AudioManager

# Class: AudioManager

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L41)

## Constructors

### Constructor

> **new AudioManager**(): `AudioManager`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L50)

#### Returns

`AudioManager`

## Accessors

### listener

#### Get Signature

> **get** **listener**(): `AudioListener`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:152](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L152)

Instância interna do `THREE.AudioListener`.

Deve ser adicionado à câmera principal para que os cálculos espaciais de
áudio funcionem corretamente:
```ts
camera.add(audioManager.listener);
```

##### Returns

`AudioListener`

***

### muted

#### Get Signature

> **get** **muted**(): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L159)

Indica se o áudio está atualmente silenciado via `muteAll()`.

##### Returns

`boolean`

## Methods

### createPositionalSound()

> **createPositionalSound**(`audioBuffer`, `entity`): `PositionalAudio`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L96)

Cria um som **posicional** e o adiciona como filho do `entity` fornecido.

O som herdará a posição do `entity` no espaço 3D, permitindo atenuação e
panoramização automáticas pelo `THREE.AudioListener`.

#### Parameters

##### audioBuffer

`AudioBuffer`

Buffer de áudio previamente carregado.

##### entity

`Object3D`

Objeto Three.js (`Object3D`, `Mesh`, `Group`, etc.) ao
  qual o som será ancorado na cena.

#### Returns

`PositionalAudio`

Instância de `THREE.PositionalAudio` já adicionada ao `entity`.

#### Example

```ts
const explosion = audioManager.createPositionalSound(buffer, mesh);
explosion.play();
```

***

### createSound()

> **createSound**(`audioBuffer`, `options?`): `Audio`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L73)

Cria um som **não-posicional** (global) — ideal para trilha sonora e
efeitos de UI que não devem sofrer atenuação espacial.

O som é associado ao `AudioListener` interno mas **não** é adicionado à
cena automaticamente; adicione-o a um `Object3D` se precisar vinculá-lo
ao grafo de cena.

#### Parameters

##### audioBuffer

`AudioBuffer`

Buffer de áudio previamente carregado (ex.: via
  `AssetLoader.loadAudio()`).

##### options?

[`SoundOptions`](../interfaces/SoundOptions.md) = `{}`

Opções de loop e volume iniciais.

#### Returns

`Audio`

Instância de `THREE.Audio` pronta para uso.

#### Example

```ts
const music = audioManager.createSound(buffer, { loop: true, volume: 0.4 });
music.play();
```

***

### muteAll()

> **muteAll**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:123](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L123)

Silencia todos os sons definindo o volume mestre para `0`.

O volume anterior é salvo internamente e pode ser restaurado via
`unmuteAll()`. Chamadas repetidas sem `unmuteAll()` intermediário são
ignoradas para não sobrescrever o volume salvo.

#### Returns

`void`

***

### setMasterVolume()

> **setMasterVolume**(`v`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L112)

Define o volume mestre aplicado a **todos** os sons gerenciados por este
`AudioListener`.

#### Parameters

##### v

`number`

Valor entre `0` (silêncio) e `1` (volume máximo). Valores fora
  desse intervalo são aceitos pelo Web Audio API mas podem distorcer o som.

#### Returns

`void`

***

### unmuteAll()

> **unmuteAll**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/AudioManager.ts:135](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AudioManager.ts#L135)

Restaura o volume mestre ao valor anterior à última chamada de `muteAll()`.

Sem efeito se `muteAll()` não foi chamado anteriormente.

#### Returns

`void`
