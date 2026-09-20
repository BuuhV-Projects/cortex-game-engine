[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Steam

# Variable: Steam

> `const` **Steam**: `object`

Defined in: [src/core/steamworks.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/steamworks.ts#L92)

Fachada da Steam. Objeto único (não há sessão por instância — a Steam é
global ao processo).

## Type Declaration

### appId()

> `readonly` **appId**(): `number`

App id desta sessão; `0` sem Steam.

#### Returns

`number`

### clearAchievement()

> `readonly` **clearAchievement**(`id`): `boolean`

Desmarca a conquista (reset de progresso/dev). Também exige `storeStats()`.

#### Parameters

##### id

`string`

#### Returns

`boolean`

### getFloatStat()

> `readonly` **getFloatStat**(`name`): `number`

Valor atual de um stat float; `0` sem Steam ou stat desconhecido.

#### Parameters

##### name

`string`

#### Returns

`number`

### getIntStat()

> `readonly` **getIntStat**(`name`): `number`

Valor atual de um stat inteiro; `0` sem Steam ou stat desconhecido.

#### Parameters

##### name

`string`

#### Returns

`number`

### hasAchievement()

> `readonly` **hasAchievement**(`id`): `boolean`

`true` se o jogador já desbloqueou a conquista.

#### Parameters

##### id

`string`

#### Returns

`boolean`

### isAvailable()

> `readonly` **isAvailable**(): `boolean`

`true` quando o `SteamAPI_Init` deu certo: host com Steam, cliente aberto e
jogador logado. Use pra esconder UI que só faz sentido com Steam.

#### Returns

`boolean`

### isOverlayActive()

> `readonly` **isOverlayActive**(): `boolean`

Overlay da Steam aberto AGORA. Consulte no update pra pausar o jogo — o
jogador que abre o overlay não está mais olhando a partida.

#### Returns

`boolean`

### language()

> `readonly` **language**(): `string`

Idioma que o jogador escolheu para ESTE jogo na Steam (ex.: `brazilian`) —
útil pra pré-selecionar o idioma (SPEC-0124). `''` sem Steam.

#### Returns

`string`

### openOverlay()

> `readonly` **openOverlay**(`page?`): `boolean`

Abre o overlay na página pedida (padrão: amigos). O `true` significa
"pedido enviado" — o overlay pode estar desligado nas opções da Steam, e
quem quiser confirmar lê [Steam.isOverlayActive](#isoverlayactive).

#### Parameters

##### page?

[`SteamOverlayPage`](../type-aliases/SteamOverlayPage.md) = `'friends'`

#### Returns

`boolean`

### player()

> `readonly` **player**(): [`SteamPlayer`](../interfaces/SteamPlayer.md) \| `null`

Jogador logado, ou `null` sem Steam.

#### Returns

[`SteamPlayer`](../interfaces/SteamPlayer.md) \| `null`

### setFloatStat()

> `readonly` **setFloatStat**(`name`, `value`): `boolean`

Stat de ponto flutuante. Ver [Steam.setIntStat](#setintstat).

#### Parameters

##### name

`string`

##### value

`number`

#### Returns

`boolean`

### setIntStat()

> `readonly` **setIntStat**(`name`, `value`): `boolean`

Stat **inteiro**. Int e float são chamadas separadas porque o tipo é
definido no painel do Steamworks — adivinhar pelo valor erraria num stat
float que calha de estar inteiro.

#### Parameters

##### name

`string`

##### value

`number`

#### Returns

`boolean`

### storeStats()

> `readonly` **storeStats**(): `boolean`

Envia conquistas e stats pendentes ao servidor da Steam — é o que faz o
*toast* de conquista aparecer. Chame uma vez por marco (fim de fase, save),
não a cada `unlockAchievement`.

#### Returns

`boolean`

### unlockAchievement()

> `readonly` **unlockAchievement**(`id`): `boolean`

Marca uma conquista como obtida. **Não persiste sozinha** — chame
[Steam.storeStats](#storestats) depois (uma vez, mesmo desbloqueando várias).

#### Parameters

##### id

`string`

o *API Name* cadastrado no painel do Steamworks.

#### Returns

`boolean`

`false` se não há Steam ou o id não existe no app.
