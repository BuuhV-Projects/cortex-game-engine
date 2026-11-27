[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AssetResidency

# Class: AssetResidency

Defined in: [src/core/AssetResidency.ts:158](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L158)

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

Defined in: [src/core/AssetResidency.ts:176](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L176)

#### Parameters

##### options

[`AssetResidencyOptions`](../interfaces/AssetResidencyOptions.md)

#### Returns

`AssetResidency`

## Accessors

### stats

#### Get Signature

> **get** **stats**(): [`AssetResidencyStats`](../interfaces/AssetResidencyStats.md)

Defined in: [src/core/AssetResidency.ts:285](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L285)

Contadores atuais (cópia).

##### Returns

[`AssetResidencyStats`](../interfaces/AssetResidencyStats.md)

## Methods

### acquire()

> **acquire**(`url`): `void`

Defined in: [src/core/AssetResidency.ts:213](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L213)

Mais um usuário vivo da URL (um clone à mostra). Pode vir antes de a carga terminar.

#### Parameters

##### url

`string`

#### Returns

`void`

***

### get()

> **get**(`url`): `GLTF` \| `undefined`

Defined in: [src/core/AssetResidency.ts:201](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L201)

O GLTF residente da URL, marcado como usado agora; `undefined` se não está pronto.

#### Parameters

##### url

`string`

#### Returns

`GLTF` \| `undefined`

***

### hold()

> **hold**(`owner`, `urls`): `Promise`\<`GLTF`[]\>

Defined in: [src/core/AssetResidency.ts:236](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L236)

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

Defined in: [src/core/AssetResidency.ts:208](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L208)

Se a URL está residente (só consulta: não mexe na ordem de uso).

#### Parameters

##### url

`string`

#### Returns

`boolean`

***

### release()

> **release**(`url`): `boolean`

Defined in: [src/core/AssetResidency.ts:277](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L277)

Solta na hora uma URL residente sem uso (o jogo que sabe o que faz), com `onEvict` e `loader.release`.

#### Parameters

##### url

`string`

#### Returns

`boolean`

`true` se soltou; `false` com contador, dono, em carga ou não residente (nada é feito).

***

### request()

> **request**(`url`): `Promise`\<`GLTF`\>

Defined in: [src/core/AssetResidency.ts:189](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L189)

Carrega a URL (a carga em andamento é dividida), marca como usada agora e roda o [trim](#trim). A URL que
acabou de chegar não é solta pelo `trim` da própria chegada; nas seguintes, só o `acquire`/`hold` a protege.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<`GLTF`\>

O GLTF residente. Rejeita se a carga falhar (a próxima chamada tenta de novo).

***

### trim()

> **trim**(): `void`

Defined in: [src/core/AssetResidency.ts:268](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L268)

Enquanto os bytes residentes passam do orçamento, solta o residente usado há mais tempo sem contador nem dono
(`onEvict` antes, `loader.release` depois). Se o resto está em uso ou seguro, para e conta em
`stats.overBudget`. Nunca solta o que ainda está em carga.

#### Returns

`void`

***

### unhold()

> **unhold**(`owner`): `void`

Defined in: [src/core/AssetResidency.ts:257](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L257)

Tira a marca de `owner` das URLs dele: ficam descartáveis (sem contador nem outro dono), não soltas na hora.

#### Parameters

##### owner

`string`

#### Returns

`void`

***

### unref()

> **unref**(`url`): `void`

Defined in: [src/core/AssetResidency.ts:220](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L220)

Um usuário vivo da URL saiu. Abaixo de zero é erro de quem chama: fica em zero (e loga no `debug`).

#### Parameters

##### url

`string`

#### Returns

`void`
