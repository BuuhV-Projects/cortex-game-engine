[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseSceneDefinition

# Function: parseSceneDefinition()

> **parseSceneDefinition**(`raw`): \{ `background?`: `string` \| `number`; `fog?`: \{ `color`: `string` \| `number`; `far`: `number`; `near`: `number`; \}; `nodes`: (\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \})[]; `outdoorLighting?`: \{ `exposure?`: `number`; `sky?`: `string` \| `number`; `sunColor?`: `string` \| `number`; `sunIntensity?`: `number`; \}; `version`: `1`; \} \| `null`

Defined in: [src/scene/SceneDefinition.ts:148](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneDefinition.ts#L148)

Valida/parseia um objeto desconhecido (ex.: import de JSON) numa [SceneDefinition](../type-aliases/SceneDefinition.md).

## Parameters

### raw

`unknown`

## Returns

### Type Literal

\{ `background?`: `string` \| `number`; `fog?`: \{ `color`: `string` \| `number`; `far`: `number`; `near`: `number`; \}; `nodes`: (\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \})[]; `outdoorLighting?`: \{ `exposure?`: `number`; `sky?`: `string` \| `number`; `sunColor?`: `string` \| `number`; `sunIntensity?`: `number`; \}; `version`: `1`; \}

#### background?

> `optional` **background?**: `string` \| `number`

Cor de fundo do céu (hex). Em multi-arquivo, o último definido vence.

#### fog?

> `optional` **fog?**: `object`

Névoa (cor/near/far).

##### fog.color

> **color**: `string` \| `number` = `colorSchema`

##### fog.far

> **far**: `number`

##### fog.near

> **near**: `number`

#### nodes

> **nodes**: (\{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `oneWay?`: `boolean`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \})[]

#### outdoorLighting?

> `optional` **outdoorLighting?**: `object`

Atalho pro preset de iluminação exterior (sol+sombras+tone mapping).

##### outdoorLighting.exposure?

> `optional` **exposure?**: `number`

##### outdoorLighting.sky?

> `optional` **sky?**: `string` \| `number`

##### outdoorLighting.sunColor?

> `optional` **sunColor?**: `string` \| `number`

##### outdoorLighting.sunIntensity?

> `optional` **sunIntensity?**: `number`

#### version

> **version**: `1`

***

`null`
