[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneAnimator

# Class: SceneAnimator

Defined in: [src/scene/SceneAnimator.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L18)

Controla as **animações de um modelo** da cena (clipes embutidos no `.glb`):
escolher qual clipe toca, play/stop, loop e velocidade. Um `AnimationMixer` por
objeto animado; o [buildScene](../functions/buildScene.md) cria um e guarda em `obj.userData.cortexAnim`,
tica no `handle.update` e aplica o que vier do nó JSON (`animation`) ou da overlay
do editor. O inspector do editor lê/controla por aqui.

## Constructors

### Constructor

> **new SceneAnimator**(`root`, `clips`): `SceneAnimator`

Defined in: [src/scene/SceneAnimator.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L26)

#### Parameters

##### root

`Object3D`

##### clips

`AnimationClip`[]

#### Returns

`SceneAnimator`

## Properties

### clips

> `readonly` **clips**: `AnimationClip`[]

Defined in: [src/scene/SceneAnimator.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L21)

Clipes disponíveis (do glTF).

***

### current

> **current**: `string` \| `null` = `null`

Defined in: [src/scene/SceneAnimator.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L24)

Nome do clipe tocando agora, ou `null`.

***

### mixer

> `readonly` **mixer**: `AnimationMixer`

Defined in: [src/scene/SceneAnimator.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L19)

## Methods

### clipNames()

> **clipNames**(): `string`[]

Defined in: [src/scene/SceneAnimator.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L32)

Nomes dos clipes (pro dropdown do editor).

#### Returns

`string`[]

***

### play()

> **play**(`name`, `options?`): `void`

Defined in: [src/scene/SceneAnimator.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L37)

Toca um clipe por nome (com crossfade do anterior). `loop`/`speed` opcionais.

#### Parameters

##### name

`string`

##### options?

[`PlayOptions`](../interfaces/PlayOptions.md) = `{}`

#### Returns

`void`

***

### setSpeed()

> **setSpeed**(`speed`): `void`

Defined in: [src/scene/SceneAnimator.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L64)

Velocidade do clipe atual em runtime.

#### Parameters

##### speed

`number`

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/scene/SceneAnimator.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L57)

Para tudo (volta pro frame base).

#### Returns

`void`

***

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/scene/SceneAnimator.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAnimator.ts#L69)

Avança o mixer. Chamado pelo loop (via `handle.update` do buildScene).

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
