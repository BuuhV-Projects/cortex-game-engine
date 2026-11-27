[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AssetResidency

# Class: AssetResidency

Defined in: [src/core/AssetResidency.ts:173](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L173)

Conjunto de GLBs residentes com orçamento em bytes, contador de referências, donos e descarte do usado há mais
tempo (SPEC-0753, ADR-0754).

Quem clona o GLTF residente compartilha geometria, material e textura com ele: chame `acquire` por clone vivo e
`unref` quando ele sair, senão o `trim()` pode soltar o modelo de um boneco à mostra.

## Example

```ts
const skins = new AssetResidency({ budgetBytes: 512 * 2 ** 20, onEvict: (url) => templates.delete(url) });
await skins.hold('mission-3', urlsDaMissao3); // carrega e segura o elenco
const gltf = skins.get(url);                  // síncrono: o residente (ou undefined)
skins.acquire(url);                           // um boneco vivo usa o modelo
skins.unref(url);                             // o boneco saiu
skins.unhold('mission-3');                    // a missão acabou: descartável, não apagado
```

## Constructors

### Constructor

> **new AssetResidency**(`options`): `AssetResidency`

Defined in: [src/core/AssetResidency.ts:191](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L191)

#### Parameters

##### options

[`AssetResidencyOptions`](../interfaces/AssetResidencyOptions.md)

#### Returns

`AssetResidency`

## Accessors

### stats

#### Get Signature

> **get** **stats**(): [`AssetResidencyStats`](../interfaces/AssetResidencyStats.md)

Defined in: [src/core/AssetResidency.ts:310](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L310)

Contadores atuais (cópia).

##### Returns

[`AssetResidencyStats`](../interfaces/AssetResidencyStats.md)

## Methods

### acquire()

> **acquire**(`url`): `void`

Defined in: [src/core/AssetResidency.ts:238](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L238)

Mais um usuário vivo da URL (um clone à mostra). Pode vir antes de a carga terminar.

#### Parameters

##### url

`string`

#### Returns

`void`

***

### get()

> **get**(`url`): `GLTF` \| `undefined`

Defined in: [src/core/AssetResidency.ts:226](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L226)

O GLTF residente da URL, marcado como usado agora; `undefined` se não está pronto.

#### Parameters

##### url

`string`

#### Returns

`GLTF` \| `undefined`

***

### hold()

> **hold**(`owner`, `urls`): `Promise`\<`GLTF`[]\>

Defined in: [src/core/AssetResidency.ts:261](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L261)

Segura as URLs em nome de `owner` e pede todas. A URL fica segura enquanto algum dono a segura. Se uma carga
falha, a marca do dono sai daquela URL e a promessa rejeita; as outras seguem seguras até o `unhold`.

#### Parameters

##### owner

`string`

##### urls

readonly `string`[]

#### Returns

`Promise`\<`GLTF`[]\>

Os GLTFs na ordem de `urls`.

***

### isResident()

> **isResident**(`url`): `boolean`

Defined in: [src/core/AssetResidency.ts:233](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L233)

Se a URL está residente (só consulta: não mexe na ordem de uso).

#### Parameters

##### url

`string`

#### Returns

`boolean`

***

### release()

> **release**(`url`): `boolean`

Defined in: [src/core/AssetResidency.ts:302](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L302)

Solta na hora uma URL residente sem uso (o jogo que sabe o que faz), com `onEvict` e `loader.release`.

#### Parameters

##### url

`string`

#### Returns

`boolean`

`true` se soltou; `false` com contador, dono, em carga ou não residente (nada é feito).

***

### request()

> **request**(`url`, `options?`): `Promise`\<`GLTF`\>

Defined in: [src/core/AssetResidency.ts:209](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L209)

Carrega a URL (a carga em andamento é dividida), marca como usada agora e roda o [trim](#trim), que nunca solta
a própria URL pedida.

Sem `acquire`, nada protege o GLTF depois que o `request` devolve: outra carga que chega na mesma rodada de
microtasks (no host nativo o `fetch` é síncrono) pode soltá-lo antes de quem pediu chamar o `acquire`. Quem vai
usar o GLTF passa `{ acquire: true }`: o contador vale desde o pedido, antes de a carga chegar, como o
`REQUEST_MODEL` do GTA SA, que marca o modelo antes de ler. Se a carga falha, esse `acquire` é desfeito.

#### Parameters

##### url

`string`

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`GLTF`\>

O GLTF residente. Rejeita se a carga falhar (a próxima chamada tenta de novo).

***

### trim()

> **trim**(): `void`

Defined in: [src/core/AssetResidency.ts:293](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L293)

Enquanto os bytes residentes passam do orçamento, solta o residente usado há mais tempo sem contador nem dono
(`onEvict` antes, `loader.release` depois). Se o resto está em uso ou seguro, para e conta em
`stats.overBudget`. Nunca solta o que ainda está em carga.

#### Returns

`void`

***

### unhold()

> **unhold**(`owner`): `void`

Defined in: [src/core/AssetResidency.ts:282](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L282)

Tira a marca de `owner` das URLs dele: ficam descartáveis (sem contador nem outro dono), não soltas na hora.

#### Parameters

##### owner

`string`

#### Returns

`void`

***

### unref()

> **unref**(`url`): `void`

Defined in: [src/core/AssetResidency.ts:245](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L245)

Um usuário vivo da URL saiu. Abaixo de zero é erro de quem chama: fica em zero (e loga no `debug`).

#### Parameters

##### url

`string`

#### Returns

`void`
