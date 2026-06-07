[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AssetLoader

# Class: AssetLoader

Defined in: [src/core/AssetLoader.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L34)

## Constructors

### Constructor

> **new AssetLoader**(): `AssetLoader`

#### Returns

`AssetLoader`

## Accessors

### cacheSize

#### Get Signature

> **get** **cacheSize**(): `number`

Defined in: [src/core/AssetLoader.ts:170](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L170)

Número de entradas atualmente no cache.
Útil para diagnóstico e testes.

##### Returns

`number`

## Methods

### clearCache()

> **clearCache**(): `void`

Defined in: [src/core/AssetLoader.ts:179](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L179)

Remove todas as entradas do cache interno.
Não descarta texturas da GPU — chamar `texture.dispose()` manualmente
se necessário antes de limpar.

#### Returns

`void`

***

### loadAudio()

> **loadAudio**(`url`): `Promise`\<`AudioBuffer`\>

Defined in: [src/core/AssetLoader.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L122)

Carrega um arquivo de áudio a partir da `url` e o armazena em cache.
Chamadas subsequentes com a mesma URL retornam o buffer em cache.

#### Parameters

##### url

`string`

Caminho ou URL absoluta para o arquivo de áudio.

#### Returns

`Promise`\<`AudioBuffer`\>

Promessa resolvida com `AudioBuffer`.

***

### loadFBX()

> **loadFBX**(`url`): `Promise`\<`Group`\<`Object3DEventMap`\>\>

Defined in: [src/core/AssetLoader.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L104)

Carrega um modelo FBX a partir da `url` e o armazena em cache.
Chamadas subsequentes com a mesma URL retornam o grupo em cache.

O `THREE.Group` retornado tem `.animations` populado com os
`AnimationClip`s embarcados no FBX — passe pra um `AnimationMixer`
pra tocar (`mixer.clipAction(group.animations[0]).play()`).

Suporte adicionado pra abrir caminho a assets de bancos públicos
(Mixamo, Sketchfab) que frequentemente entregam só `.fbx` com rig
e animações. GLTF/GLB continua sendo o formato preferido por ser
mais leve e otimizado pra web.

#### Parameters

##### url

`string`

Caminho ou URL absoluta para o arquivo `.fbx`.

#### Returns

`Promise`\<`Group`\<`Object3DEventMap`\>\>

Promessa resolvida com `THREE.Group` (com `animations`).

***

### loadGLTF()

> **loadGLTF**(`url`): `Promise`\<`GLTF`\>

Defined in: [src/core/AssetLoader.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L77)

Carrega um modelo GLTF/GLB a partir da `url` e o armazena em cache.
Chamadas subsequentes com a mesma URL retornam o objeto em cache.

#### Parameters

##### url

`string`

Caminho ou URL absoluta para o arquivo `.gltf` ou `.glb`.

#### Returns

`Promise`\<`GLTF`\>

Promessa resolvida com o objeto `GLTF`.

***

### loadTexture()

> **loadTexture**(`url`, `options?`): `Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Defined in: [src/core/AssetLoader.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L54)

Carrega uma textura a partir da `url` e a armazena em cache.
Chamadas subsequentes com a mesma URL retornam a instância em cache sem
nova requisição de rede.

#### Parameters

##### url

`string`

Caminho ou URL absoluta para o arquivo de imagem.

##### options?

###### pixelated?

`boolean`

#### Returns

`Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Promessa resolvida com `THREE.Texture`.

***

### preload()

> **preload**(`urlArray`, `onProgress?`): `Promise`\<`Asset`[]\>

Defined in: [src/core/AssetLoader.ts:148](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L148)

Pré-carrega um conjunto de URLs em paralelo.

O tipo de loader é inferido pela extensão do arquivo:
- `.gltf` / `.glb` → `loadGLTF`
- `.fbx` → `loadFBX`
- `.mp3` / `.wav` / `.ogg` / `.aac` / `.m4a` → `loadAudio`
- qualquer outra extensão → `loadTexture` (png, jpg, webp, etc.)

Assets já presentes no cache são retornados imediatamente sem nova
requisição.

#### Parameters

##### urlArray

`string`[]

Lista de URLs a pré-carregar.

##### onProgress?

(`loaded`, `total`) => `void`

#### Returns

`Promise`\<`Asset`[]\>

Promessa resolvida com array de assets na mesma ordem da entrada.
