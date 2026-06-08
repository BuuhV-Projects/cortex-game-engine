[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / addSceneNode

# Function: addSceneNode()

> **addSceneNode**(`scene`, `node`): `Promise`\<`Object3D`\<`Object3DEventMap`\> \| `null`\>

Defined in: [src/scene/SceneBuilder.ts:361](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L361)

Instancia UM nó de cena e o adiciona à `scene` (modelo `.glb`, primitiva, luz
ou água), já nomeado por `id` e com `place`/`transform` aplicado. Usado pelo
[buildScene](buildScene.md) e pelo editor pra **adicionar um objeto ao vivo** (F2).

Nota: água adicionada por aqui não é animada (sem o tick do `buildScene`) até
recarregar — adicionar água ao vivo é caso raro.

## Parameters

### scene

[`Scene`](../classes/Scene.md)

### node

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \} \| \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \} \| \{ `distance?`: `number`; `height?`: `number`; `id`: `string`; `image`: `string`; `parallax?`: `number`; `type`: `"background"`; `widthFactor?`: `number`; \}

#### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; \}

##### animation?

\{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \} = `animationSchema`

Animação do modelo `.glb` (clipe a tocar, loop, velocidade). Ver [SceneAnimator](../classes/SceneAnimator.md).

##### animation.autoplay?

`boolean` = `...`

##### animation.clip?

`string` = `...`

##### animation.loop?

`boolean` = `...`

##### animation.speed?

`number` = `...`

##### animations?

`Record`\<`string`, `string`\> = `...`

**Mapa ação→clipe do player** (`{ idle, walk, run, jump, fall, ... }`) — quando o
nó é `player`, o [PlatformerAnimationSystem](../classes/PlatformerAnimationSystem.md) toca a animação certa por
estado. Ausentes são auto-mapeados pelos nomes dos clipes. Ver
[PlayerAnimatorComponent](../classes/PlayerAnimatorComponent.md).

##### attach?

\{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \} = `attachSchema`

Placement por socket (encaixa em outro nó via âncoras do kit).

##### attach.offset?

\[`number`, `number`, `number`\] = `...`

Deslocamento extra `[x,y,z]` após o encaixe.

##### attach.socket

`string` = `...`

Socket DESTE asset (nome de âncora no kit).

##### attach.to

`string` = `...`

`id` do nó-alvo na cena.

##### attach.toSocket

`string` = `...`

Âncora do asset do alvo onde encaixar.

##### castShadow?

`boolean` = `...`

##### collider?

\{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \} = `colliderSchema`

Collider 2D (plataformer): vira sólido/plataforma.

##### collider.height?

`number` = `...`

##### collider.offsetX?

`number` = `...`

##### collider.offsetY?

`number` = `...`

##### collider.oneWay?

`boolean` = `...`

##### collider.points?

\[`number`, `number`\][] = `...`

Perfil do chão (LOCAL, ordenado por X) quando `shape` é `heightfield`.

##### collider.shape?

`"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"` = `...`

##### collider.solid?

`boolean` = `...`

##### collider.width?

`number` = `...`

##### id

`string` = `...`

Identificador único — chave pra overlay/editor e `Object3D.name`.

##### matte?

`boolean` = `...`

Materiais foscos (mata o brilho PBR → look cartoon). Ver [setMatte](setMatte.md).

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

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; \}

##### animation?

\{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \} = `animationSchema`

Animação do modelo `.glb` (clipe a tocar, loop, velocidade). Ver [SceneAnimator](../classes/SceneAnimator.md).

##### animation.autoplay?

`boolean` = `...`

##### animation.clip?

`string` = `...`

##### animation.loop?

`boolean` = `...`

##### animation.speed?

`number` = `...`

##### animations?

`Record`\<`string`, `string`\> = `...`

**Mapa ação→clipe do player** (`{ idle, walk, run, jump, fall, ... }`) — quando o
nó é `player`, o [PlatformerAnimationSystem](../classes/PlatformerAnimationSystem.md) toca a animação certa por
estado. Ausentes são auto-mapeados pelos nomes dos clipes. Ver
[PlayerAnimatorComponent](../classes/PlayerAnimatorComponent.md).

##### attach?

\{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \} = `attachSchema`

Placement por socket (encaixa em outro nó via âncoras do kit).

##### attach.offset?

\[`number`, `number`, `number`\] = `...`

Deslocamento extra `[x,y,z]` após o encaixe.

##### attach.socket

`string` = `...`

Socket DESTE asset (nome de âncora no kit).

##### attach.to

`string` = `...`

`id` do nó-alvo na cena.

##### attach.toSocket

`string` = `...`

Âncora do asset do alvo onde encaixar.

##### castShadow?

`boolean` = `...`

##### collider?

\{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \} = `colliderSchema`

Collider 2D (plataformer): vira sólido/plataforma.

##### collider.height?

`number` = `...`

##### collider.offsetX?

`number` = `...`

##### collider.offsetY?

`number` = `...`

##### collider.oneWay?

`boolean` = `...`

##### collider.points?

\[`number`, `number`\][] = `...`

Perfil do chão (LOCAL, ordenado por X) quando `shape` é `heightfield`.

##### collider.shape?

`"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"` = `...`

##### collider.solid?

`boolean` = `...`

##### collider.width?

`number` = `...`

##### color?

`string` \| `number` = `...`

##### id

`string` = `...`

Identificador único — chave pra overlay/editor e `Object3D.name`.

##### matte?

`boolean` = `...`

Materiais foscos (mata o brilho PBR → look cartoon). Ver [setMatte](setMatte.md).

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

***

#### Type Literal

\{ `distance?`: `number`; `height?`: `number`; `id`: `string`; `image`: `string`; `parallax?`: `number`; `type`: `"background"`; `widthFactor?`: `number`; \}

##### distance?

`number` = `...`

Distância no Z atrás da câmera. Default 40.

##### height?

`number` = `...`

Altura em unidades de mundo. Default 30.

##### id

`string` = `...`

##### image

`string` = `...`

URL da imagem (jpg/png) do backdrop — tileável na horizontal.

##### parallax?

`number` = `...`

Parallax 0–1 (0 = travado na tela, 1 = anda com o mundo). Default 0.3.

##### type

`"background"` = `...`

##### widthFactor?

`number` = `...`

Largura em múltiplos da altura. Default 2.6.

## Returns

`Promise`\<`Object3D`\<`Object3DEventMap`\> \| `null`\>

O `Object3D` criado, ou `null` se o tipo for desconhecido.
