[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AssetLoader

# Class: AssetLoader

Defined in: [src/core/AssetLoader.ts:164](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L164)

## Constructors

### Constructor

> **new AssetLoader**(): `AssetLoader`

Defined in: [src/core/AssetLoader.ts:181](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L181)

#### Returns

`AssetLoader`

## Accessors

### cacheSize

#### Get Signature

> **get** **cacheSize**(): `number`

Defined in: [src/core/AssetLoader.ts:321](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L321)

Número de entradas atualmente no cache.
Útil para diagnóstico e testes.

##### Returns

`number`

## Methods

### clearCache()

> **clearCache**(): `void`

Defined in: [src/core/AssetLoader.ts:330](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L330)

Remove todas as entradas do cache interno.
Não descarta texturas da GPU — chamar `texture.dispose()` manualmente
se necessário antes de limpar (ou usar [disposeCache](#disposecache)).

#### Returns

`void`

***

### disposeCache()

> **disposeCache**(): `void`

Defined in: [src/core/AssetLoader.ts:370](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L370)

**Despeja** o cache liberando os recursos de cada asset (SPEC-0152):
texturas → `dispose()`; GLTF/FBX → [disposeObjectResources](../functions/disposeObjectResources.md)
(geometria + BVH + materiais/texturas); áudio → `free?.()` (existe no
wrapper de `AudioBuffer` do host nativo, que solta o PCM decodificado do
lado C++ — ADR-0153; no browser é no-op). Depois disto, cada URL volta a
custar uma carga completa na próxima requisição.

#### Returns

`void`

***

### evict()

> **evict**(`url`): `void`

Defined in: [src/core/AssetLoader.ts:340](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L340)

Tira **uma** URL do cache, sem dispor o asset (o hot reload de GLB, SPEC-0697,
decide o dispose depois de trocar os clones). A próxima carga da URL vai à rede.

#### Parameters

##### url

`string`

A mesma chave usada na carga.

#### Returns

`void`

***

### loadAudio()

> **loadAudio**(`url`): `Promise`\<`AudioBuffer`\>

Defined in: [src/core/AssetLoader.ts:280](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L280)

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

Defined in: [src/core/AssetLoader.ts:265](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L265)

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

Defined in: [src/core/AssetLoader.ts:223](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L223)

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

Defined in: [src/core/AssetLoader.ts:198](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L198)

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

Defined in: [src/core/AssetLoader.ts:299](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L299)

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

***

### release()

> **release**(`url`): `boolean`

Defined in: [src/core/AssetLoader.ts:354](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L354)

**Solta uma** URL já carregada (SPEC-0753): GLTF/FBX → [disposeObjectResources](../functions/disposeObjectResources.md) com `closeImages`;
textura → `dispose()` e fecha a imagem decodificada; áudio → `free?.()`. Tira a URL do cache; a próxima
carga vai à rede. Quem chama garante que ninguém mais usa o asset (nem clones dele): a imagem fechada não
sobe para a GPU de novo.

#### Parameters

##### url

`string`

A mesma chave usada na carga.

#### Returns

`boolean`

`true` se havia asset pronto e ele foi solto; `false` para URL nunca pedida ou ainda em carga
  (nada é feito).
