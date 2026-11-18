[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SteamCloud

# Variable: SteamCloud

> `const` **SteamCloud**: `object`

Defined in: [src/core/steamCloud.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/steamCloud.ts#L26)

Fachada do Remote Storage. Objeto único, como a [Steam](Steam.md).

## Type Declaration

### isAvailable()

> `readonly` **isAvailable**(): `boolean`

`true` quando a Steam inicializou e o Remote Storage está vivo.

#### Returns

`boolean`

### read()

> `readonly` **read**(`name`): `string` \| `null`

Conteúdo do arquivo, ou `null` se ausente ou sem Steam.

#### Parameters

##### name

`string`

#### Returns

`string` \| `null`

### remove()

> `readonly` **remove**(`name`): `boolean`

Apaga o arquivo local e na nuvem.

#### Parameters

##### name

`string`

#### Returns

`boolean`

### write()

> `readonly` **write**(`name`, `text`): `boolean`

Grava (substitui) o arquivo. `false` sem Steam, sem cota ou nuvem desligada no app.

#### Parameters

##### name

`string`

##### text

`string`

#### Returns

`boolean`
