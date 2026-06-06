[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / addSceneNode

# Function: addSceneNode()

> **addSceneNode**(`scene`, `node`): `Promise`\<`Object3D`\<`Object3DEventMap`\> \| `null`\>

Defined in: [src/scene/SceneBuilder.ts:155](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L155)

Instancia UM nó de cena e o adiciona à `scene` (modelo `.glb`, primitiva, luz
ou água), já nomeado por `id` e com `place`/`transform` aplicado. Usado pelo
[buildScene](buildScene.md) e pelo editor pra **adicionar um objeto ao vivo** (F2).

Nota: água adicionada por aqui não é animada (sem o tick do `buildScene`) até
recarregar — adicionar água ao vivo é caso raro.

## Parameters

### scene

[`Scene`](../classes/Scene.md)

### node

\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \}

#### Type Literal

\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \}

##### castShadow?

`boolean` = `...`

##### collider?

\{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \} = `colliderSchema`

Collider 2D (plataformer): vira sólido/plataforma.

##### collider.height?

`number` = `...`

##### collider.oneWay?

`boolean` = `...`

##### collider.solid?

`boolean` = `...`

##### collider.width?

`number` = `...`

##### id

`string` = `...`

Identificador único — chave pra overlay/editor e `Object3D.name`.

##### place?

\{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `placeSchema`

##### place.rotY?

`number` = `...`

##### place.scale?

`number` = `...`

##### place.x?

`number` = `...`

##### place.y?

`number` = `...`

##### place.z?

`number` = `...`

##### player?

`boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \} = `playerSchema`

Marca como player (controller + corpo + alvo da câmera).

##### receiveShadow?

`boolean` = `...`

##### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

##### transform.position?

\[`number`, `number`, `number`\] = `...`

##### transform.rotation?

\[`number`, `number`, `number`\] = `...`

##### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

##### type

`"model"` = `...`

##### url

`string` = `...`

***

#### Type Literal

\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \}

##### castShadow?

`boolean` = `...`

##### collider?

\{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \} = `colliderSchema`

Collider 2D (plataformer): vira sólido/plataforma.

##### collider.height?

`number` = `...`

##### collider.oneWay?

`boolean` = `...`

##### collider.solid?

`boolean` = `...`

##### collider.width?

`number` = `...`

##### color?

`string` \| `number` = `...`

##### id

`string` = `...`

Identificador único — chave pra overlay/editor e `Object3D.name`.

##### metalness?

`number` = `...`

##### place?

\{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `placeSchema`

##### place.rotY?

`number` = `...`

##### place.scale?

`number` = `...`

##### place.x?

`number` = `...`

##### place.y?

`number` = `...`

##### place.z?

`number` = `...`

##### player?

`boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \} = `playerSchema`

Marca como player (controller + corpo + alvo da câmera).

##### receiveShadow?

`boolean` = `...`

##### roughness?

`number` = `...`

##### shape

`"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"` = `...`

##### size?

`number` \| \[`number`, `number`, `number`\] = `...`

##### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

##### transform.position?

\[`number`, `number`, `number`\] = `...`

##### transform.rotation?

\[`number`, `number`, `number`\] = `...`

##### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

##### type

`"primitive"` = `...`

***

#### Type Literal

\{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \}

##### castShadow?

`boolean` = `...`

##### color?

`string` \| `number` = `...`

##### groundColor?

`string` \| `number` = `...`

Cor do chão (só `hemisphere`).

##### id

`string` = `...`

##### intensity?

`number` = `...`

##### light

`"directional"` \| `"hemisphere"` \| `"ambient"` = `...`

##### position?

\[`number`, `number`, `number`\] = `...`

##### type

`"light"` = `...`

## Returns

`Promise`\<`Object3D`\<`Object3DEventMap`\> \| `null`\>

O `Object3D` criado, ou `null` se o tipo for desconhecido.
