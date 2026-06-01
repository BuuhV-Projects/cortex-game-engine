[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Skybox

# Class: Skybox

Defined in: [src/core/Skybox.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L38)

## Constructors

### Constructor

> **new Skybox**(): `Skybox`

#### Returns

`Skybox`

## Methods

### clear()

> `static` **clear**(`scene`): `void`

Defined in: [src/core/Skybox.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L80)

Remove o environment/background da cena (volta ao fundo padrão).
Não dá `dispose()` na textura — guarde o retorno de `fromHDRI` se quiser.

#### Parameters

##### scene

[`Scene`](Scene.md)

#### Returns

`void`

***

### fromHDRI()

> `static` **fromHDRI**(`scene`, `url`, `options?`): `Promise`\<`DataTexture`\>

Defined in: [src/core/Skybox.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L50)

Carrega um HDRI equiretangular e o aplica como iluminação (e fundo) da cena.

#### Parameters

##### scene

[`Scene`](Scene.md)

Cena do engine onde aplicar o environment.

##### url

`string`

Caminho/URL do arquivo `.hdr` (equiretangular).

##### options?

[`HDRISkyboxOptions`](../interfaces/HDRISkyboxOptions.md) = `{}`

Ajustes de fundo e intensidade.

#### Returns

`Promise`\<`DataTexture`\>

A `DataTexture` carregada (pra dispose manual, se necessário).

#### Example

```ts
await Skybox.fromHDRI(scene, 'assets/sky.hdr', { backgroundBlurriness: 0.3 });
```
