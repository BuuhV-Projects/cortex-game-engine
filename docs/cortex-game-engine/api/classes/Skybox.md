[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Skybox

# Class: Skybox

Defined in: [src/core/Skybox.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L101)

## Constructors

### Constructor

> **new Skybox**(): `Skybox`

#### Returns

`Skybox`

## Methods

### clear()

> `static` **clear**(`scene`): `void`

Defined in: [src/core/Skybox.ts:227](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L227)

Remove o environment/background da cena (volta ao fundo padrão).
Não dá `dispose()` na textura — guarde o retorno de `fromHDRI` se quiser.

#### Parameters

##### scene

[`Scene`](Scene.md)

#### Returns

`void`

***

### fromGradient()

> `static` **fromGradient**(`scene`, `options?`, `renderer?`): `DataTexture`

Defined in: [src/core/Skybox.ts:181](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L181)

Céu **gradiente procedural** (sem arquivo) — zênite → horizonte → chão, aplicado
como `background` visível E `environment` (luz/reflexo suave). Ideal pra um céu
limpo e ensolarado (ex.: Brasília: azul forte). Funciona em WebGPU usando uma
`DataTexture` equiretangular 2:1 (gradiente vertical), igual ao HDRI.

#### Parameters

##### scene

[`Scene`](Scene.md)

##### options?

[`GradientSkyOptions`](../interfaces/GradientSkyOptions.md) = `{}`

##### renderer?

[`Renderer`](Renderer.md)

#### Returns

`DataTexture`

#### Example

```ts
Skybox.fromGradient(scene, { top: '#1f72d8', middle: '#d6ecfb' }); // céu azul limpo
```

***

### fromHDRI()

> `static` **fromHDRI**(`scene`, `url`, `options?`, `renderer?`): `Promise`\<`DataTexture`\>

Defined in: [src/core/Skybox.ts:145](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L145)

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

##### renderer?

[`Renderer`](Renderer.md)

#### Returns

`Promise`\<`DataTexture`\>

A `DataTexture` carregada (pra dispose manual, se necessário).

#### Example

```ts
await Skybox.fromHDRI(scene, 'assets/sky.hdr', { backgroundBlurriness: 0.3 });
```

***

### fromPanorama()

> `static` **fromPanorama**(`scene`, `texture`, `options?`, `renderer?`): `Texture`

Defined in: [src/core/Skybox.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L115)

Aplica um **panorama equiretangular** já carregado (PNG/JPG/KTX2 2:1, céu
desenhado) como fundo da cena — e, com `lighting`, também como environment.
Declarado na cena por `outdoorLighting.skybox` (SPEC-0296).

#### Parameters

##### scene

[`Scene`](Scene.md)

Cena onde aplicar.

##### texture

`Texture`

Textura do panorama (ex.: de `loadTexture(url, false)`).

##### options?

[`PanoramaSkyOptions`](../interfaces/PanoramaSkyOptions.md) = `{}`

Luz opcional e intensidade.

##### renderer?

[`Renderer`](Renderer.md)

#### Returns

`Texture`

A própria textura, já configurada.

#### Example

```ts
Skybox.fromPanorama(scene, await loadTexture('assets/sky/ceu.png', false));
```
