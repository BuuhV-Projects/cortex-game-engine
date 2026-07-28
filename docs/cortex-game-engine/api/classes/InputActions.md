[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InputActions

# Class: InputActions

Defined in: [src/input/InputActions.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L55)

## Constructors

### Constructor

> **new InputActions**(`input`, `gamepad?`, `options?`): `InputActions`

Defined in: [src/input/InputActions.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L69)

#### Parameters

##### input

[`InputManager`](InputManager.md)

##### gamepad?

[`GamepadManager`](GamepadManager.md)

##### options?

[`InputActionsOptions`](../interfaces/InputActionsOptions.md) = `{}`

#### Returns

`InputActions`

## Accessors

### actions

#### Get Signature

> **get** **actions**(): [`ActionDef`](../interfaces/ActionDef.md)[]

Defined in: [src/input/InputActions.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L96)

Todas as ações registradas, na ordem de registro.

##### Returns

[`ActionDef`](../interfaces/ActionDef.md)[]

## Methods

### actionsOf()

> **actionsOf**(`group`): [`ActionDef`](../interfaces/ActionDef.md)[]

Defined in: [src/input/InputActions.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L101)

Ações de um grupo (seção da tela de Controles), sem as escondidas.

#### Parameters

##### group

`string`

#### Returns

[`ActionDef`](../interfaces/ActionDef.md)[]

***

### axis()

> **axis**(`negativeId`, `positiveId`): `number`

Defined in: [src/input/InputActions.ts:140](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L140)

Eixo -1..1 a partir de um par de ações (`axis('moveLeft','moveRight')`).
Analógico quando a origem é stick; ±1 no teclado.

#### Parameters

##### negativeId

`string`

##### positiveId

`string`

#### Returns

`number`

***

### bindingsOf()

> **bindingsOf**(`id`): [`InputBinding`](../interfaces/InputBinding.md)[]

Defined in: [src/input/InputActions.ts:203](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L203)

Bindings atuais da ação (cópia).

#### Parameters

##### id

`string`

#### Returns

[`InputBinding`](../interfaces/InputBinding.md)[]

***

### clearBindings()

> **clearBindings**(`id`): `void`

Defined in: [src/input/InputActions.ts:243](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L243)

Remove todos os bindings da ação (fica sem comando).

#### Parameters

##### id

`string`

#### Returns

`void`

***

### consume()

> **consume**(`id?`): `void`

Defined in: [src/input/InputActions.ts:188](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L188)

Marca a ação como já-pressionada sem que o jogador tenha apertado nada —
evita a "borda fantasma" quando um menu fecha com o botão ainda segurado
(mesmo problema do SPEC-0156). Sem id, vale pra todas.

#### Parameters

##### id?

`string`

#### Returns

`void`

***

### define()

> **define**(`action`): `void`

Defined in: [src/input/InputActions.ts:88](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L88)

Registra (ou substitui) uma ação. É assim que o JOGO declara o vocabulário
dele — a engine só traz o mínimo que os sistemas dela usam.

#### Parameters

##### action

[`ActionDef`](../interfaces/ActionDef.md)

#### Returns

`void`

#### Example

```ts
actions.define({ id: 'plant', group: 'farm', labelKey: 'input.action.plant',
                 label: 'Plantar', defaults: parseBindingList('key:f,pad:2') });
```

***

### definitionOf()

> **definitionOf**(`id`): [`ActionDef`](../interfaces/ActionDef.md) \| `undefined`

Defined in: [src/input/InputActions.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L106)

Definição de uma ação, ou `undefined` se não registrada.

#### Parameters

##### id

`string`

#### Returns

[`ActionDef`](../interfaces/ActionDef.md) \| `undefined`

***

### isDefault()

> **isDefault**(`id`): `boolean`

Defined in: [src/input/InputActions.ts:258](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L258)

`true` se a ação está exatamente como saiu de fábrica.

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### isDown()

> **isDown**(`id`): `boolean`

Defined in: [src/input/InputActions.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L113)

`true` se qualquer binding da ação estiver ativo agora.

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### loadFrom()

> **loadFrom**(`config`): `void`

Defined in: [src/input/InputActions.ts:270](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L270)

Aplica os bindings salvos pelo jogador. Linha malformada é ignorada (a ação
fica no default) — `config.ini` é editável à mão e não pode derrubar o jogo.

#### Parameters

##### config

[`ActionConfigStore`](../interfaces/ActionConfigStore.md)

#### Returns

`void`

***

### poll()

> **poll**(): `void`

Defined in: [src/input/InputActions.ts:176](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L176)

Atualiza as bordas ([pressed](#pressed)/[released](#released)). Chame 1×/frame,
DEPOIS do `gamepad.poll()` — senão a borda enxerga o estado do frame anterior.

#### Returns

`void`

***

### pollDevices()

> **pollDevices**(): `void`

Defined in: [src/input/InputActions.ts:168](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L168)

Relê o estado dos DISPOSITIVOS (hoje, o gamepad) **sem** mexer nas bordas
de [pressed](#pressed)/[released](#released).

Existe pros MENUS: lá o `Game` está parado, então ninguém chama
`gamepad.poll()` e o `isDown()` de qualquer binding de controle ficaria
eternamente `false` — o controle "parava de funcionar" no menu. Quem dirige
um loop próprio (tela de menu, `UiLayer`) chama isto por frame; é seguro
chamar mesmo com o `Game` rodando, porque não toca no estado das bordas.

#### Returns

`void`

***

### pressed()

> **pressed**(`id`): `boolean`

Defined in: [src/input/InputActions.ts:149](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L149)

`true` no frame em que a ação foi pressionada (borda). Exige [poll](#poll)
1×/frame — o `Game` já faz isso pro `game.actions`.

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### rebind()

> **rebind**(`id`, `binding`, `family`): `string`[]

Defined in: [src/input/InputActions.ts:220](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L220)

Aplica um binding capturado na tela de Controles: **substitui** os bindings
da mesma família (teclado/mouse ou gamepad) da ação, preservando a outra
coluna, e **remove** o mesmo binding de qualquer outra ação (dois comandos
na mesma tecla deixariam o jogo ambíguo). Devolve os ids que perderam o
binding, pra tela avisar.

#### Parameters

##### id

`string`

##### binding

[`InputBinding`](../interfaces/InputBinding.md)

##### family

(`b`) => `boolean`

#### Returns

`string`[]

***

### released()

> **released**(`id`): `boolean`

Defined in: [src/input/InputActions.ts:154](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L154)

`true` no frame em que a ação foi solta (borda).

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### resetToDefaults()

> **resetToDefaults**(`id?`): `void`

Defined in: [src/input/InputActions.ts:248](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L248)

Volta a ação (ou todas, sem id) para os bindings de fábrica.

#### Parameters

##### id?

`string`

#### Returns

`void`

***

### saveTo()

> **saveTo**(`config`): `void`

Defined in: [src/input/InputActions.ts:291](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L291)

Grava **só o que difere** do default (o resto some do arquivo) — mantém o
`config.ini` legível e deixa os defaults evoluírem sem congelar os antigos.
Persiste de fato só quando o chamador der `config.save()`.

#### Parameters

##### config

[`ActionConfigStore`](../interfaces/ActionConfigStore.md)

#### Returns

`void`

***

### setBindings()

> **setBindings**(`id`, `bindings`): `void`

Defined in: [src/input/InputActions.ts:208](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L208)

Substitui todos os bindings da ação.

#### Parameters

##### id

`string`

##### bindings

readonly [`InputBinding`](../interfaces/InputBinding.md)[]

#### Returns

`void`

***

### value()

> **value**(`id`): `number`

Defined in: [src/input/InputActions.ts:125](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L125)

Valor analógico da ação (0..1): 1 pra tecla/botão digital, a magnitude da
deflexão pra eixo de stick, o valor do gatilho pra LT/RT. Pega o MAIOR
entre os bindings — teclado e stick convivem sem um zerar o outro.

#### Parameters

##### id

`string`

#### Returns

`number`
