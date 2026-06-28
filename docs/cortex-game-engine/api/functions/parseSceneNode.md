[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseSceneNode

# Function: parseSceneNode()

> **parseSceneNode**(`raw`): \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; \}; \} \| \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; \}; \} \| \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `faces?`: `number`[][]; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `positions?`: \[`number`, `number`, `number`\][]; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape?`: \{ `kind`: `"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"`; `params?`: `Record`\<`string`, `number`\>; \}; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"mesh"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; \}; \} \| \{ `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `conformTerrain?`: `boolean`; `id`: `string`; `markings?`: `"dashed"` \| `"single-yellow"` \| `"double-yellow"` \| `"passing"` \| `"lane"` \| \{ `repeat?`: `number`; `url`: `string`; \}; `maxSlope?`: `number`; `nodes`: \[`number`, `number`, `number`\][]; `steps?`: `number`; `surface?`: `"asphalt"` \| `"concrete"` \| `"dirt"` \| `"brick"` \| `"cobblestone"` \| \{ `color?`: `string` \| `number`; `diffuse?`: `string`; `normal?`: `string`; `repeat?`: `number`; \}; `taludeWidth?`: `number`; `terrainMode?`: `"conform"` \| `"cutfill"`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"road"`; `width?`: `number`; `yOffset?`: `number`; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \} \| \{ `distance?`: `number`; `height?`: `number`; `id`: `string`; `image`: `string`; `parallax?`: `number`; `type`: `"background"`; `widthFactor?`: `number`; \} \| \{ `alphaTest?`: `number`; `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `height?`: `number`; `id`: `string`; `initial?`: `string`; `pixelated?`: `boolean`; `pixelsPerUnit?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `rows?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"sprite"`; `url`: `string`; `width?`: `number`; \} \| \{ `color?`: `string` \| `number`; `heights?`: `number`[]; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `resolution?`: `number`; `size?`: `number` \| \[`number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"terrain"`; \} \| \{ `capacity?`: `number`; `collide?`: `boolean`; `id`: `string`; `instances?`: `number`[]; `kind?`: `"tree"` \| `"grass"`; `model?`: `string`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"vegetation"`; \} \| `null`

Defined in: [src/scene/SceneDefinition.ts:578](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneDefinition.ts#L578)

Valida um único [SceneNode](../type-aliases/SceneNode.md) (ex.: nó adicionado pelo editor na overlay).

## Parameters

### raw

`unknown`

## Returns

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; \}; \}

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

#### character?

> `optional` **character?**: `object` = `characterSchema`

Marca como **Character** (cápsula + gravidade + pulo + step, estilo UPBGE). Ver [CharacterConfig](../type-aliases/CharacterConfig.md).

##### character.fallSpeedMax?

> `optional` **fallSpeedMax?**: `number`

##### character.gravity?

> `optional` **gravity?**: `number`

##### character.groundY?

> `optional` **groundY?**: `number`

Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real.

##### character.height?

> `optional` **height?**: `number`

##### character.jumpForce?

> `optional` **jumpForce?**: `number`

##### character.maxJumps?

> `optional` **maxJumps?**: `number`

##### character.radius?

> `optional` **radius?**: `number`

##### character.stepHeight?

> `optional` **stepHeight?**: `number`

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

#### material?

> `optional` **material?**: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

Material/shader por objeto (standard/unlit/toon). Ver [applyMaterial](applyMaterial.md).

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

#### rapierBody?

> `optional` **rapierBody?**: `object` = `rapierBodySchema`

Marca como **corpo rígido do Rapier** (física dinâmica 3D — cai/empilha/empurra). Ver [RapierBodyConfig](../type-aliases/RapierBodyConfig.md).

##### rapierBody.bodyType?

> `optional` **bodyType?**: `"dynamic"` \| `"fixed"` \| `"kinematic"`

##### rapierBody.friction?

> `optional` **friction?**: `number`

##### rapierBody.isSensor?

> `optional` **isSensor?**: `boolean`

##### rapierBody.restitution?

> `optional` **restitution?**: `number`

##### rapierBody.shape?

> `optional` **shape?**: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}

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

#### vehicle?

> `optional` **vehicle?**: `object` = `vehicleSchema`

Config do **veículo** (motor/freio/suspensão/centro de massa) — editável no Inspector. Ver ADR-0081.

##### vehicle.centerOfMass?

> `optional` **centerOfMass?**: `object`

Centro de massa: y = altura (BAIXO = estável, não capota), z = frente/trás.

##### vehicle.centerOfMass.x?

> `optional` **x?**: `number`

##### vehicle.centerOfMass.y?

> `optional` **y?**: `number`

##### vehicle.centerOfMass.z?

> `optional` **z?**: `number`

##### vehicle.chassisHalfExtents?

> `optional` **chassisHalfExtents?**: `object`

##### vehicle.chassisHalfExtents.x?

> `optional` **x?**: `number`

##### vehicle.chassisHalfExtents.y?

> `optional` **y?**: `number`

##### vehicle.chassisHalfExtents.z?

> `optional` **z?**: `number`

##### vehicle.chassisOffset?

> `optional` **chassisOffset?**: `object`

Posição da caixa do chassi (collider) relativa à origem.

##### vehicle.chassisOffset.x?

> `optional` **x?**: `number`

##### vehicle.chassisOffset.y?

> `optional` **y?**: `number`

##### vehicle.chassisOffset.z?

> `optional` **z?**: `number`

##### vehicle.engineForce?

> `optional` **engineForce?**: `number`

##### vehicle.engineLayers?

> `optional` **engineLayers?**: `object`

Áudio do motor em CAMADAS (crossfade on/off × faixas de RPM) — som realista.
Cada slot é um caminho de áudio (loop). Tem prioridade sobre `engineSound`.

##### vehicle.engineLayers.offHigh?

> `optional` **offHigh?**: `string`

##### vehicle.engineLayers.offLow?

> `optional` **offLow?**: `string`

##### vehicle.engineLayers.offMid?

> `optional` **offMid?**: `string`

##### vehicle.engineLayers.offVeryHigh?

> `optional` **offVeryHigh?**: `string`

##### vehicle.engineLayers.onHigh?

> `optional` **onHigh?**: `string`

##### vehicle.engineLayers.onLow?

> `optional` **onLow?**: `string`

##### vehicle.engineLayers.onMid?

> `optional` **onMid?**: `string`

##### vehicle.engineSound?

> `optional` **engineSound?**: `string`

Caminho do áudio do MOTOR (loop único — fallback simples). Ver [EngineSound](../classes/EngineSound.md).

##### vehicle.frictionSlip?

> `optional` **frictionSlip?**: `number`

##### vehicle.handbrakeForce?

> `optional` **handbrakeForce?**: `number`

##### vehicle.mass?

> `optional` **mass?**: `number`

##### vehicle.maxBrake?

> `optional` **maxBrake?**: `number`

##### vehicle.maxReverseSpeed?

> `optional` **maxReverseSpeed?**: `number`

##### vehicle.maxSpeed?

> `optional` **maxSpeed?**: `number`

Velocidade no fim do velocímetro (km/h).

##### vehicle.maxSteer?

> `optional` **maxSteer?**: `number`

##### vehicle.maxSuspensionTravel?

> `optional` **maxSuspensionTravel?**: `number`

##### vehicle.reverseForce?

> `optional` **reverseForce?**: `number`

##### vehicle.rollingResistance?

> `optional` **rollingResistance?**: `number`

##### vehicle.steerSmooth?

> `optional` **steerSmooth?**: `number`

##### vehicle.suspensionCompression?

> `optional` **suspensionCompression?**: `number`

##### vehicle.suspensionRelaxation?

> `optional` **suspensionRelaxation?**: `number`

##### vehicle.suspensionRestLength?

> `optional` **suspensionRestLength?**: `number`

Altura/curso de repouso da suspensão.

##### vehicle.suspensionStiffness?

> `optional` **suspensionStiffness?**: `number`

Sensibilidade da suspensão (rigidez).

##### vehicle.throttleSmooth?

> `optional` **throttleSmooth?**: `number`

##### vehicle.wheelSpinRate?

> `optional` **wheelSpinRate?**: `number`

***

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; \}; \}

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

#### character?

> `optional` **character?**: `object` = `characterSchema`

Marca como **Character** (cápsula + gravidade + pulo + step, estilo UPBGE). Ver [CharacterConfig](../type-aliases/CharacterConfig.md).

##### character.fallSpeedMax?

> `optional` **fallSpeedMax?**: `number`

##### character.gravity?

> `optional` **gravity?**: `number`

##### character.groundY?

> `optional` **groundY?**: `number`

Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real.

##### character.height?

> `optional` **height?**: `number`

##### character.jumpForce?

> `optional` **jumpForce?**: `number`

##### character.maxJumps?

> `optional` **maxJumps?**: `number`

##### character.radius?

> `optional` **radius?**: `number`

##### character.stepHeight?

> `optional` **stepHeight?**: `number`

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

#### material?

> `optional` **material?**: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

Material/shader por objeto (standard/unlit/toon). Ver [applyMaterial](applyMaterial.md).

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

#### rapierBody?

> `optional` **rapierBody?**: `object` = `rapierBodySchema`

Marca como **corpo rígido do Rapier** (física dinâmica 3D — cai/empilha/empurra). Ver [RapierBodyConfig](../type-aliases/RapierBodyConfig.md).

##### rapierBody.bodyType?

> `optional` **bodyType?**: `"dynamic"` \| `"fixed"` \| `"kinematic"`

##### rapierBody.friction?

> `optional` **friction?**: `number`

##### rapierBody.isSensor?

> `optional` **isSensor?**: `boolean`

##### rapierBody.restitution?

> `optional` **restitution?**: `number`

##### rapierBody.shape?

> `optional` **shape?**: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}

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

#### vehicle?

> `optional` **vehicle?**: `object` = `vehicleSchema`

Config do **veículo** (motor/freio/suspensão/centro de massa) — editável no Inspector. Ver ADR-0081.

##### vehicle.centerOfMass?

> `optional` **centerOfMass?**: `object`

Centro de massa: y = altura (BAIXO = estável, não capota), z = frente/trás.

##### vehicle.centerOfMass.x?

> `optional` **x?**: `number`

##### vehicle.centerOfMass.y?

> `optional` **y?**: `number`

##### vehicle.centerOfMass.z?

> `optional` **z?**: `number`

##### vehicle.chassisHalfExtents?

> `optional` **chassisHalfExtents?**: `object`

##### vehicle.chassisHalfExtents.x?

> `optional` **x?**: `number`

##### vehicle.chassisHalfExtents.y?

> `optional` **y?**: `number`

##### vehicle.chassisHalfExtents.z?

> `optional` **z?**: `number`

##### vehicle.chassisOffset?

> `optional` **chassisOffset?**: `object`

Posição da caixa do chassi (collider) relativa à origem.

##### vehicle.chassisOffset.x?

> `optional` **x?**: `number`

##### vehicle.chassisOffset.y?

> `optional` **y?**: `number`

##### vehicle.chassisOffset.z?

> `optional` **z?**: `number`

##### vehicle.engineForce?

> `optional` **engineForce?**: `number`

##### vehicle.engineLayers?

> `optional` **engineLayers?**: `object`

Áudio do motor em CAMADAS (crossfade on/off × faixas de RPM) — som realista.
Cada slot é um caminho de áudio (loop). Tem prioridade sobre `engineSound`.

##### vehicle.engineLayers.offHigh?

> `optional` **offHigh?**: `string`

##### vehicle.engineLayers.offLow?

> `optional` **offLow?**: `string`

##### vehicle.engineLayers.offMid?

> `optional` **offMid?**: `string`

##### vehicle.engineLayers.offVeryHigh?

> `optional` **offVeryHigh?**: `string`

##### vehicle.engineLayers.onHigh?

> `optional` **onHigh?**: `string`

##### vehicle.engineLayers.onLow?

> `optional` **onLow?**: `string`

##### vehicle.engineLayers.onMid?

> `optional` **onMid?**: `string`

##### vehicle.engineSound?

> `optional` **engineSound?**: `string`

Caminho do áudio do MOTOR (loop único — fallback simples). Ver [EngineSound](../classes/EngineSound.md).

##### vehicle.frictionSlip?

> `optional` **frictionSlip?**: `number`

##### vehicle.handbrakeForce?

> `optional` **handbrakeForce?**: `number`

##### vehicle.mass?

> `optional` **mass?**: `number`

##### vehicle.maxBrake?

> `optional` **maxBrake?**: `number`

##### vehicle.maxReverseSpeed?

> `optional` **maxReverseSpeed?**: `number`

##### vehicle.maxSpeed?

> `optional` **maxSpeed?**: `number`

Velocidade no fim do velocímetro (km/h).

##### vehicle.maxSteer?

> `optional` **maxSteer?**: `number`

##### vehicle.maxSuspensionTravel?

> `optional` **maxSuspensionTravel?**: `number`

##### vehicle.reverseForce?

> `optional` **reverseForce?**: `number`

##### vehicle.rollingResistance?

> `optional` **rollingResistance?**: `number`

##### vehicle.steerSmooth?

> `optional` **steerSmooth?**: `number`

##### vehicle.suspensionCompression?

> `optional` **suspensionCompression?**: `number`

##### vehicle.suspensionRelaxation?

> `optional` **suspensionRelaxation?**: `number`

##### vehicle.suspensionRestLength?

> `optional` **suspensionRestLength?**: `number`

Altura/curso de repouso da suspensão.

##### vehicle.suspensionStiffness?

> `optional` **suspensionStiffness?**: `number`

Sensibilidade da suspensão (rigidez).

##### vehicle.throttleSmooth?

> `optional` **throttleSmooth?**: `number`

##### vehicle.wheelSpinRate?

> `optional` **wheelSpinRate?**: `number`

***

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `offset?`: \[`number`, `number`, `number`\]; `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `faces?`: `number`[][]; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `positions?`: \[`number`, `number`, `number`\][]; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `shape?`: \{ `kind`: `"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"`; `params?`: `Record`\<`string`, `number`\>; \}; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"mesh"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; \}; \}

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

#### character?

> `optional` **character?**: `object` = `characterSchema`

Marca como **Character** (cápsula + gravidade + pulo + step, estilo UPBGE). Ver [CharacterConfig](../type-aliases/CharacterConfig.md).

##### character.fallSpeedMax?

> `optional` **fallSpeedMax?**: `number`

##### character.gravity?

> `optional` **gravity?**: `number`

##### character.groundY?

> `optional` **groundY?**: `number`

Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real.

##### character.height?

> `optional` **height?**: `number`

##### character.jumpForce?

> `optional` **jumpForce?**: `number`

##### character.maxJumps?

> `optional` **maxJumps?**: `number`

##### character.radius?

> `optional` **radius?**: `number`

##### character.stepHeight?

> `optional` **stepHeight?**: `number`

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

#### faces?

> `optional` **faces?**: `number`[][]

Faces poligonais (índices em `positions`), em ordem CCW.

#### id

> **id**: `string`

Identificador único — chave pra overlay/editor e `Object3D.name`.

#### material?

> `optional` **material?**: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

Material/shader por objeto (standard/unlit/toon). Ver [applyMaterial](applyMaterial.md).

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

#### positions?

> `optional` **positions?**: \[`number`, `number`, `number`\][]

Vértices lógicos (malha freeform). Usado quando não há `shape`.

#### rapierBody?

> `optional` **rapierBody?**: `object` = `rapierBodySchema`

Marca como **corpo rígido do Rapier** (física dinâmica 3D — cai/empilha/empurra). Ver [RapierBodyConfig](../type-aliases/RapierBodyConfig.md).

##### rapierBody.bodyType?

> `optional` **bodyType?**: `"dynamic"` \| `"fixed"` \| `"kinematic"`

##### rapierBody.friction?

> `optional` **friction?**: `number`

##### rapierBody.isSensor?

> `optional` **isSensor?**: `boolean`

##### rapierBody.restitution?

> `optional` **restitution?**: `number`

##### rapierBody.shape?

> `optional` **shape?**: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}

#### receiveShadow?

> `optional` **receiveShadow?**: `boolean`

#### roughness?

> `optional` **roughness?**: `number`

#### shape?

> `optional` **shape?**: `object`

##### shape.kind

> **kind**: `"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"`

##### shape.params?

> `optional` **params?**: `Record`\<`string`, `number`\>

#### transform?

> `optional` **transform?**: `object` = `transformSchema`

##### transform.position?

> `optional` **position?**: \[`number`, `number`, `number`\]

##### transform.rotation?

> `optional` **rotation?**: \[`number`, `number`, `number`\]

##### transform.scale?

> `optional` **scale?**: `number` \| \[`number`, `number`, `number`\]

#### type

> **type**: `"mesh"`

#### vehicle?

> `optional` **vehicle?**: `object` = `vehicleSchema`

Config do **veículo** (motor/freio/suspensão/centro de massa) — editável no Inspector. Ver ADR-0081.

##### vehicle.centerOfMass?

> `optional` **centerOfMass?**: `object`

Centro de massa: y = altura (BAIXO = estável, não capota), z = frente/trás.

##### vehicle.centerOfMass.x?

> `optional` **x?**: `number`

##### vehicle.centerOfMass.y?

> `optional` **y?**: `number`

##### vehicle.centerOfMass.z?

> `optional` **z?**: `number`

##### vehicle.chassisHalfExtents?

> `optional` **chassisHalfExtents?**: `object`

##### vehicle.chassisHalfExtents.x?

> `optional` **x?**: `number`

##### vehicle.chassisHalfExtents.y?

> `optional` **y?**: `number`

##### vehicle.chassisHalfExtents.z?

> `optional` **z?**: `number`

##### vehicle.chassisOffset?

> `optional` **chassisOffset?**: `object`

Posição da caixa do chassi (collider) relativa à origem.

##### vehicle.chassisOffset.x?

> `optional` **x?**: `number`

##### vehicle.chassisOffset.y?

> `optional` **y?**: `number`

##### vehicle.chassisOffset.z?

> `optional` **z?**: `number`

##### vehicle.engineForce?

> `optional` **engineForce?**: `number`

##### vehicle.engineLayers?

> `optional` **engineLayers?**: `object`

Áudio do motor em CAMADAS (crossfade on/off × faixas de RPM) — som realista.
Cada slot é um caminho de áudio (loop). Tem prioridade sobre `engineSound`.

##### vehicle.engineLayers.offHigh?

> `optional` **offHigh?**: `string`

##### vehicle.engineLayers.offLow?

> `optional` **offLow?**: `string`

##### vehicle.engineLayers.offMid?

> `optional` **offMid?**: `string`

##### vehicle.engineLayers.offVeryHigh?

> `optional` **offVeryHigh?**: `string`

##### vehicle.engineLayers.onHigh?

> `optional` **onHigh?**: `string`

##### vehicle.engineLayers.onLow?

> `optional` **onLow?**: `string`

##### vehicle.engineLayers.onMid?

> `optional` **onMid?**: `string`

##### vehicle.engineSound?

> `optional` **engineSound?**: `string`

Caminho do áudio do MOTOR (loop único — fallback simples). Ver [EngineSound](../classes/EngineSound.md).

##### vehicle.frictionSlip?

> `optional` **frictionSlip?**: `number`

##### vehicle.handbrakeForce?

> `optional` **handbrakeForce?**: `number`

##### vehicle.mass?

> `optional` **mass?**: `number`

##### vehicle.maxBrake?

> `optional` **maxBrake?**: `number`

##### vehicle.maxReverseSpeed?

> `optional` **maxReverseSpeed?**: `number`

##### vehicle.maxSpeed?

> `optional` **maxSpeed?**: `number`

Velocidade no fim do velocímetro (km/h).

##### vehicle.maxSteer?

> `optional` **maxSteer?**: `number`

##### vehicle.maxSuspensionTravel?

> `optional` **maxSuspensionTravel?**: `number`

##### vehicle.reverseForce?

> `optional` **reverseForce?**: `number`

##### vehicle.rollingResistance?

> `optional` **rollingResistance?**: `number`

##### vehicle.steerSmooth?

> `optional` **steerSmooth?**: `number`

##### vehicle.suspensionCompression?

> `optional` **suspensionCompression?**: `number`

##### vehicle.suspensionRelaxation?

> `optional` **suspensionRelaxation?**: `number`

##### vehicle.suspensionRestLength?

> `optional` **suspensionRestLength?**: `number`

Altura/curso de repouso da suspensão.

##### vehicle.suspensionStiffness?

> `optional` **suspensionStiffness?**: `number`

Sensibilidade da suspensão (rigidez).

##### vehicle.throttleSmooth?

> `optional` **throttleSmooth?**: `number`

##### vehicle.wheelSpinRate?

> `optional` **wheelSpinRate?**: `number`

***

### Type Literal

\{ `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `conformTerrain?`: `boolean`; `id`: `string`; `markings?`: `"dashed"` \| `"single-yellow"` \| `"double-yellow"` \| `"passing"` \| `"lane"` \| \{ `repeat?`: `number`; `url`: `string`; \}; `maxSlope?`: `number`; `nodes`: \[`number`, `number`, `number`\][]; `steps?`: `number`; `surface?`: `"asphalt"` \| `"concrete"` \| `"dirt"` \| `"brick"` \| `"cobblestone"` \| \{ `color?`: `string` \| `number`; `diffuse?`: `string`; `normal?`: `string`; `repeat?`: `number`; \}; `taludeWidth?`: `number`; `terrainMode?`: `"conform"` \| `"cutfill"`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"road"`; `width?`: `number`; `yOffset?`: `number`; \}

#### collider?

> `optional` **collider?**: `object` = `colliderSchema`

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

#### conformTerrain?

> `optional` **conformTerrain?**: `boolean`

A pista acompanha a altura do terreno (raycast por amostra). Default true.

#### id

> **id**: `string`

#### markings?

> `optional` **markings?**: `"dashed"` \| `"single-yellow"` \| `"double-yellow"` \| `"passing"` \| `"lane"` \| \{ `repeat?`: `number`; `url`: `string`; \}

Marcação de pista (overlay, ADR-0076): nome embutido (`dashed`/`single-yellow`/
`double-yellow`/`passing`/`lane`) ou `{ url, repeat }`. Ausente = sem marcação.

#### maxSlope?

> `optional` **maxSlope?**: `number`

Inclinação máx. do greide (Δalt/Δhoriz). Só `cutfill`. Default 0.25 (25% — a
estrada sobe o morro fazendo ladeira; baixe pra pista mais plana que aplaina mais).

#### nodes

> **nodes**: \[`number`, `number`, `number`\][]

Pontos de controle da spline (≥2), em metros.

#### steps?

> `optional` **steps?**: `number`

Densidade da tessellation: amostras por 90° de curvatura (adaptativa). Default 16.

#### surface?

> `optional` **surface?**: `"asphalt"` \| `"concrete"` \| `"dirt"` \| `"brick"` \| `"cobblestone"` \| \{ `color?`: `string` \| `number`; `diffuse?`: `string`; `normal?`: `string`; `repeat?`: `number`; \}

Superfície: nome embutido (`asphalt`/…) ou URLs explícitas (diffuse/normal/repeat).

#### taludeWidth?

> `optional` **taludeWidth?**: `number`

Largura do talude (transição terreno↔pista) em cada lado, m. Só `cutfill`. Default 6.

#### terrainMode?

> `optional` **terrainMode?**: `"conform"` \| `"cutfill"`

Como a pista se relaciona com o terreno (ADR-0072 Fase 2):
- `'conform'` (default): a **pista** se deforma acompanhando o relevo (Fase 1).
- `'cutfill'`: o **terreno** se adapta à pista — greide suavizado + *cut & fill*
  (corta morro acima, aterra vale abaixo) com talude nas laterais. Não-destrutivo.

#### transform?

> `optional` **transform?**: `object` = `transformSchema`

##### transform.position?

> `optional` **position?**: \[`number`, `number`, `number`\]

##### transform.rotation?

> `optional` **rotation?**: \[`number`, `number`, `number`\]

##### transform.scale?

> `optional` **scale?**: `number` \| \[`number`, `number`, `number`\]

#### type

> **type**: `"road"`

#### width?

> `optional` **width?**: `number`

Largura da pista (m). Default 8 (≈2 faixas).

#### yOffset?

> `optional` **yOffset?**: `number`

Levanta a pista acima do chão (evita z-fight). Default 0.05 m.

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

### Type Literal

\{ `color?`: `string` \| `number`; `heights?`: `number`[]; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `resolution?`: `number`; `size?`: `number` \| \[`number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"terrain"`; \}

#### color?

> `optional` **color?**: `string` \| `number`

Cor base do material. Default verde-grama.

#### heights?

> `optional` **heights?**: `number`[]

Heightmap (row-major, `(res+1)²` alturas) — autoria do editor.

#### id

> **id**: `string`

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

#### resolution?

> `optional` **resolution?**: `number`

Segmentos por lado (resolução da grade). Default 64.

#### size?

> `optional` **size?**: `number` \| \[`number`, `number`\]

Largura × profundidade (XZ) em unidades. Número = quadrado. Default 50.

#### transform?

> `optional` **transform?**: `object` = `transformSchema`

##### transform.position?

> `optional` **position?**: \[`number`, `number`, `number`\]

##### transform.rotation?

> `optional` **rotation?**: \[`number`, `number`, `number`\]

##### transform.scale?

> `optional` **scale?**: `number` \| \[`number`, `number`, `number`\]

#### type

> **type**: `"terrain"`

***

### Type Literal

\{ `capacity?`: `number`; `collide?`: `boolean`; `id`: `string`; `instances?`: `number`[]; `kind?`: `"tree"` \| `"grass"`; `model?`: `string`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"vegetation"`; \}

#### capacity?

> `optional` **capacity?**: `number`

Capacidade máxima de instâncias (buffer pré-alocado). Default 8192.

#### collide?

> `optional` **collide?**: `boolean`

Colide com o player (vira `cortexSolid` — o personagem é empurrado pra fora dos
troncos). Default: liga pra árvores/modelos, desliga pra `kind: 'grass'`.

#### id

> **id**: `string`

#### instances?

> `optional` **instances?**: `number`[]

Instâncias espalhadas: plano `[x,y,z,rotY,scale]` por instância.

#### kind?

> `optional` **kind?**: `"tree"` \| `"grass"`

Placeholder quando sem `model`: `tree` (default) ou `grass`.

#### model?

> `optional` **model?**: `string`

URL do `.glb` do modelo. Omitido = placeholder procedural (ver `kind`).

#### transform?

> `optional` **transform?**: `object` = `transformSchema`

##### transform.position?

> `optional` **position?**: \[`number`, `number`, `number`\]

##### transform.rotation?

> `optional` **rotation?**: \[`number`, `number`, `number`\]

##### transform.scale?

> `optional` **scale?**: `number` \| \[`number`, `number`, `number`\]

#### type

> **type**: `"vegetation"`

***

`null`
