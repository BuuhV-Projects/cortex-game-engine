[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InputManager

# Class: InputManager

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L76)

## Extends

- `EventTarget`

## Constructors

### Constructor

> **new InputManager**(): `InputManager`

Defined in: node\_modules/typescript/lib/lib.dom.d.ts:14397

#### Returns

`InputManager`

#### Inherited from

`EventTarget.constructor`

## Accessors

### domElement

#### Get Signature

> **get** **domElement**(): `HTMLElement` \| `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:305](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L305)

O elemento HTML atualmente anexado, ou `null` se `detach()` foi chamado
ou `attach()` ainda não foi invocado.

##### Returns

`HTMLElement` \| `null`

## Methods

### attach()

> **attach**(`domElement`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:109](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L109)

Registra os listeners de teclado e mouse no `domElement` fornecido.
Se já houver um elemento anexado, `detach()` é chamado antes.

#### Parameters

##### domElement

`HTMLElement`

Elemento HTML alvo (ex.: `canvas`, `document.body`).

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:204](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L204)

Remove todos os listeners do elemento e limpa o estado interno.
Sem efeito se nenhum elemento estiver anexado.

#### Returns

`void`

***

### getMouseDelta()

> **getMouseDelta**(): [`MouseDelta`](../interfaces/MouseDelta.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:293](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L293)

Retorna o delta acumulado de movimento do mouse desde a última chamada
a este método e **reseta** o acumulador interno.

Ideal para uso no loop de jogo: chame uma vez por frame para obter o
deslocamento total do frame atual.

#### Returns

[`MouseDelta`](../interfaces/MouseDelta.md)

#### Example

```ts
// no onUpdate do GameLoop:
const { x, y } = input.getMouseDelta();
camera.rotateY(-x * sensitivity);
```

***

### getMousePosition()

> **getMousePosition**(): [`MousePosition`](../interfaces/MousePosition.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:277](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L277)

Retorna a posição atual do mouse em coordenadas relativas ao elemento
anexado.

Retorna `{ x: 0, y: 0 }` se nenhum elemento estiver anexado ou se o
mouse ainda não tiver se movido.

#### Returns

[`MousePosition`](../interfaces/MousePosition.md)

***

### isButtonDown()

> **isButtonDown**(`button`): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:266](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L266)

Retorna `true` se o botão do mouse identificado por `button` estiver
pressionado.

#### Parameters

##### button

`number`

Índice do botão: 0 = esquerdo, 1 = meio, 2 = direito.

#### Returns

`boolean`

#### Example

```ts
if (input.isButtonDown(0)) shoot();
```

***

### isKeyDown()

> **isKeyDown**(`key`): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:253](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L253)

Retorna `true` se a tecla identificada por `key` estiver pressionada.

#### Parameters

##### key

`string`

Valor de `KeyboardEvent.key` (ex.: `"ArrowLeft"`, `"a"`, `" "`).

#### Returns

`boolean`

#### Example

```ts
if (input.isKeyDown('ArrowLeft')) player.moveLeft();
```
