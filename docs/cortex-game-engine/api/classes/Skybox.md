[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Skybox

# Class: Skybox

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L64)

## Constructors

### Constructor

> **new Skybox**(): `Skybox`

#### Returns

`Skybox`

## Methods

### clear()

> `static` **clear**(`scene`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:154](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L154)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L112)

Céu **gradiente procedural** (sem arquivo) — zênite → horizonte → chão, aplicado
como `background` visível E `environment` (luz/reflexo suave). Ideal pra um céu
limpo e ensolarado (ex.: Brasília: azul forte). Funciona em WebGPU usando uma
`DataTexture` equiretangular 1×N (gradiente vertical), igual ao HDRI.

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Skybox.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Skybox.ts#L76)

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
