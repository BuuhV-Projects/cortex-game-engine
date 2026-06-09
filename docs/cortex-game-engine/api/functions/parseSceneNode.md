[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseSceneNode

# Function: parseSceneNode()

> **parseSceneNode**(`raw`): \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \} \| \{ `distance?`: `number`; `height?`: `number`; `id`: `string`; `image`: `string`; `parallax?`: `number`; `type`: `"background"`; `widthFactor?`: `number`; \} \| \{ `alphaTest?`: `number`; `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `height?`: `number`; `id`: `string`; `initial?`: `string`; `pixelated?`: `boolean`; `pixelsPerUnit?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `rows?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"sprite"`; `url`: `string`; `width?`: `number`; \} \| `null`

Defined in: [src/scene/SceneDefinition.ts:278](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneDefinition.ts#L278)

Valida um único [SceneNode](../type-aliases/SceneNode.md) (ex.: nó adicionado pelo editor na overlay).

## Parameters

### raw

`unknown`

## Returns

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \}

#### animation?

> `optional` **animation?**: `object` = `animationSchema`

Animação do modelo `.glb` (clipe a tocar, loop, velocidade). Ver [SceneAnimator](../classes/SceneAnimator.md).

##### animation.autoplay?

> `optional` **autoplay?**: `boolean`

##### animation.clip?

> `optional` **clip?**: `string`

##### animation.loop?

> `optional` **loop?**: `boolean`

##### animation.speed?

> `optional` **speed?**: `number`

#### animations?

> `optional` **animations?**: `Record`\<`string`, `string`\>

**Mapa ação→clipe do player** (`{ idle, walk, run, jump, fall, ... }`) — quando o
nó é `player`, o [PlatformerAnimationSystem](../classes/PlatformerAnimationSystem.md) toca a animação certa por
estado. Ausentes são auto-mapeados pelos nomes dos clipes. Ver
[PlayerAnimatorComponent](../classes/PlayerAnimatorComponent.md).

#### attach?

> `optional` **attach?**: `object` = `attachSchema`

Placement por socket (encaixa em outro nó via âncoras do kit).

##### attach.offset?

> `optional` **offset?**: \[`number`, `number`, `number`\]

Deslocamento extra `[x,y,z]` após o encaixe.

##### attach.socket

> **socket**: `string`

Socket DESTE asset (nome de âncora no kit).

##### attach.to

> **to**: `string`

`id` do nó-alvo na cena.

##### attach.toSocket

> **toSocket**: `string`

Âncora do asset do alvo onde encaixar.

#### castShadow?

> `optional` **castShadow?**: `boolean`

#### collider?

> `optional` **collider?**: `object` = `colliderSchema`

Collider 2D (plataformer): vira sólido/plataforma.

##### collider.height?

> `optional` **height?**: `number`

##### collider.offsetX?

> `optional` **offsetX?**: `number`

##### collider.offsetY?

> `optional` **offsetY?**: `number`

##### collider.oneWay?

> `optional` **oneWay?**: `boolean`

##### collider.points?

> `optional` **points?**: \[`number`, `number`\][]

Perfil do chão (LOCAL, ordenado por X) quando `shape` é `heightfield`.

##### collider.shape?

> `optional` **shape?**: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`

##### collider.solid?

> `optional` **solid?**: `boolean`

##### collider.width?

> `optional` **width?**: `number`

#### id

> **id**: `string`

Identificador único — chave pra overlay/editor e `Object3D.name`.

#### matte?

> `optional` **matte?**: `boolean`

Materiais foscos (mata o brilho PBR → look cartoon). Ver [setMatte](setMatte.md).

#### place?

> `optional` **place?**: `object` = `placeSchema`

##### place.rotY?

> `optional` **rotY?**: `number`

##### place.scale?

> `optional` **scale?**: `number`

##### place.x?

> `optional` **x?**: `number`

##### place.y?

> `optional` **y?**: `number`

##### place.z?

> `optional` **z?**: `number`

#### player?

> `optional` **player?**: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \} = `playerSchema`

Marca como player (controller + corpo + alvo da câmera).

#### receiveShadow?

> `optional` **receiveShadow?**: `boolean`

#### transform?

> `optional` **transform?**: `object` = `transformSchema`

##### transform.position?

> `optional` **position?**: \[`number`, `number`, `number`\]

##### transform.rotation?

> `optional` **rotation?**: \[`number`, `number`, `number`\]

##### transform.scale?

> `optional` **scale?**: `number` \| \[`number`, `number`, `number`\]

#### type

> **type**: `"model"`

#### url

> **url**: `string`

***

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \}

#### animation?

> `optional` **animation?**: `object` = `animationSchema`

Animação do modelo `.glb` (clipe a tocar, loop, velocidade). Ver [SceneAnimator](../classes/SceneAnimator.md).

##### animation.autoplay?

> `optional` **autoplay?**: `boolean`

##### animation.clip?

> `optional` **clip?**: `string`

##### animation.loop?

> `optional` **loop?**: `boolean`

##### animation.speed?

> `optional` **speed?**: `number`

#### animations?

> `optional` **animations?**: `Record`\<`string`, `string`\>

**Mapa ação→clipe do player** (`{ idle, walk, run, jump, fall, ... }`) — quando o
nó é `player`, o [PlatformerAnimationSystem](../classes/PlatformerAnimationSystem.md) toca a animação certa por
estado. Ausentes são auto-mapeados pelos nomes dos clipes. Ver
[PlayerAnimatorComponent](../classes/PlayerAnimatorComponent.md).

#### attach?

> `optional` **attach?**: `object` = `attachSchema`

Placement por socket (encaixa em outro nó via âncoras do kit).

##### attach.offset?

> `optional` **offset?**: \[`number`, `number`, `number`\]

Deslocamento extra `[x,y,z]` após o encaixe.

##### attach.socket

> **socket**: `string`

Socket DESTE asset (nome de âncora no kit).

##### attach.to

> **to**: `string`

`id` do nó-alvo na cena.

##### attach.toSocket

> **toSocket**: `string`

Âncora do asset do alvo onde encaixar.

#### castShadow?

> `optional` **castShadow?**: `boolean`

#### collider?

> `optional` **collider?**: `object` = `colliderSchema`

Collider 2D (plataformer): vira sólido/plataforma.

##### collider.height?

> `optional` **height?**: `number`

##### collider.offsetX?

> `optional` **offsetX?**: `number`

##### collider.offsetY?

> `optional` **offsetY?**: `number`

##### collider.oneWay?

> `optional` **oneWay?**: `boolean`

##### collider.points?

> `optional` **points?**: \[`number`, `number`\][]

Perfil do chão (LOCAL, ordenado por X) quando `shape` é `heightfield`.

##### collider.shape?

> `optional` **shape?**: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`

##### collider.solid?

> `optional` **solid?**: `boolean`

##### collider.width?

> `optional` **width?**: `number`

#### color?

> `optional` **color?**: `string` \| `number`

#### id

> **id**: `string`

Identificador único — chave pra overlay/editor e `Object3D.name`.

#### matte?

> `optional` **matte?**: `boolean`

Materiais foscos (mata o brilho PBR → look cartoon). Ver [setMatte](setMatte.md).

#### metalness?

> `optional` **metalness?**: `number`

#### place?

> `optional` **place?**: `object` = `placeSchema`

##### place.rotY?

> `optional` **rotY?**: `number`

##### place.scale?

> `optional` **scale?**: `number`

##### place.x?

> `optional` **x?**: `number`

##### place.y?

> `optional` **y?**: `number`

##### place.z?

> `optional` **z?**: `number`

#### player?

> `optional` **player?**: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \} = `playerSchema`

Marca como player (controller + corpo + alvo da câmera).

#### receiveShadow?

> `optional` **receiveShadow?**: `boolean`

#### roughness?

> `optional` **roughness?**: `number`

#### shape

> **shape**: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`

#### size?

> `optional` **size?**: `number` \| \[`number`, `number`, `number`\]

#### transform?

> `optional` **transform?**: `object` = `transformSchema`

##### transform.position?

> `optional` **position?**: \[`number`, `number`, `number`\]

##### transform.rotation?

> `optional` **rotation?**: \[`number`, `number`, `number`\]

##### transform.scale?

> `optional` **scale?**: `number` \| \[`number`, `number`, `number`\]

#### type

> **type**: `"primitive"`

***

### Type Literal

\{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \}

#### castShadow?

> `optional` **castShadow?**: `boolean`

#### color?

> `optional` **color?**: `string` \| `number`

#### groundColor?

> `optional` **groundColor?**: `string` \| `number`

Cor do chão (só `hemisphere`).

#### id

> **id**: `string`

#### intensity?

> `optional` **intensity?**: `number`

#### light

> **light**: `"directional"` \| `"hemisphere"` \| `"ambient"`

#### position?

> `optional` **position?**: \[`number`, `number`, `number`\]

#### type

> **type**: `"light"`

***

### Type Literal

\{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \}

***

### Type Literal

\{ `distance?`: `number`; `height?`: `number`; `id`: `string`; `image`: `string`; `parallax?`: `number`; `type`: `"background"`; `widthFactor?`: `number`; \}

#### distance?

> `optional` **distance?**: `number`

Distância no Z atrás da câmera. Default 40.

#### height?

> `optional` **height?**: `number`

Altura em unidades de mundo. Default 30.

#### id

> **id**: `string`

#### image

> **image**: `string`

URL da imagem (jpg/png) do backdrop — tileável na horizontal.

#### parallax?

> `optional` **parallax?**: `number`

Parallax 0–1 (0 = travado na tela, 1 = anda com o mundo). Default 0.3.

#### type

> **type**: `"background"`

#### widthFactor?

> `optional` **widthFactor?**: `number`

Largura em múltiplos da altura. Default 2.6.

***

### Type Literal

\{ `alphaTest?`: `number`; `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `height?`: `number`; `id`: `string`; `initial?`: `string`; `pixelated?`: `boolean`; `pixelsPerUnit?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `rows?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"sprite"`; `url`: `string`; `width?`: `number`; \}

#### alphaTest?

> `optional` **alphaTest?**: `number`

Recorte por alpha (0 = sem corte; 0.5 bom pra borda dura). Default 0.5.

#### animations?

> `optional` **animations?**: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>

Animações nomeadas (`{ idle: { frames: [0], fps: 4 }, run: {...} }`).

#### columns?

> `optional` **columns?**: `number`

Alternativa a frameWidth: nº de colunas (frame = larguraTex / columns).

#### frameHeight?

> `optional` **frameHeight?**: `number`

Altura de um frame em px (spritesheet).

#### frameWidth?

> `optional` **frameWidth?**: `number`

Largura de um frame em px (spritesheet). Omitir = imagem inteira é 1 frame.

#### height?

> `optional` **height?**: `number`

Altura em unidades de mundo.

#### id

> **id**: `string`

#### initial?

> `optional` **initial?**: `string`

Animação inicial a tocar.

#### pixelated?

> `optional` **pixelated?**: `boolean`

Nearest filter (pixel art). Default true.

#### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Px por unidade de mundo pra dimensionar o sprite. Default 100.

#### place?

> `optional` **place?**: `object` = `placeSchema`

##### place.rotY?

> `optional` **rotY?**: `number`

##### place.scale?

> `optional` **scale?**: `number`

##### place.x?

> `optional` **x?**: `number`

##### place.y?

> `optional` **y?**: `number`

##### place.z?

> `optional` **z?**: `number`

#### rows?

> `optional` **rows?**: `number`

Alternativa a frameHeight: nº de linhas.

#### transform?

> `optional` **transform?**: `object` = `transformSchema`

##### transform.position?

> `optional` **position?**: \[`number`, `number`, `number`\]

##### transform.rotation?

> `optional` **rotation?**: \[`number`, `number`, `number`\]

##### transform.scale?

> `optional` **scale?**: `number` \| \[`number`, `number`, `number`\]

#### type

> **type**: `"sprite"`

#### url

> **url**: `string`

URL da imagem (png/jpg/webp) — o sprite ou a spritesheet.

#### width?

> `optional` **width?**: `number`

Largura em unidades de mundo (sobrescreve o cálculo por pixelsPerUnit).

***

`null`
