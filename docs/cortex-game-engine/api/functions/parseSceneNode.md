[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseSceneNode

# Function: parseSceneNode()

> **parseSceneNode**(`raw`): \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `scripts?`: `object`[]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \} \| \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `scripts?`: `object`[]; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \} \| \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `faces?`: `number`[][]; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `positions?`: \[`number`, `number`, `number`\][]; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `scripts?`: `object`[]; `shape?`: \{ `kind`: `"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"`; `params?`: `Record`\<`string`, `number`\>; \}; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"mesh"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \} \| \{ `distance?`: `number`; `height?`: `number`; `id`: `string`; `image`: `string`; `parallax?`: `number`; `type`: `"background"`; `widthFactor?`: `number`; \} \| \{ `alphaTest?`: `number`; `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `height?`: `number`; `id`: `string`; `initial?`: `string`; `pixelated?`: `boolean`; `pixelsPerUnit?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `rows?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"sprite"`; `url`: `string`; `width?`: `number`; \} \| \{ `color?`: `string` \| `number`; `heights?`: `number`[]; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `resolution?`: `number`; `size?`: `number` \| \[`number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"terrain"`; \} \| \{ `capacity?`: `number`; `collide?`: `boolean`; `id`: `string`; `instances?`: `number`[]; `kind?`: `"tree"` \| `"grass"`; `model?`: `string`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"vegetation"`; \} \| \{ `height?`: `number`; `id`: `string`; `image?`: `string`; `opacity?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `size?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"underlay"`; \} \| `null`

Defined in: [src/scene/SceneDefinition.ts:532](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneDefinition.ts#L532)

Valida um único [SceneNode](../type-aliases/SceneNode.md) (ex.: nó adicionado pelo editor na overlay).

## Parameters

### raw

`unknown`

## Returns

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `scripts?`: `object`[]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \}

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

> `optional` **material?**: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

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

#### scripts?

> `optional` **scripts?**: `object`[]

**Scripts anexados** (estilo MonoBehaviour — ADR-0085): comportamentos por nome
registrado + valores dos campos. O [ScriptHostSystem](../classes/ScriptHostSystem.md) roda no Play; o Inspector
adiciona/edita ("Adicionar Componente → Script"). Overlay `data.scripts[id]` vence.

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

##### vehicle.yawInertiaScale?

> `optional` **yawInertiaScale?**: `number`

Escala da inércia de curva (yaw): <1 = vira mais fácil/ágil; 1 = físico.

***

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `scripts?`: `object`[]; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \}

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

> `optional` **material?**: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

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

#### scripts?

> `optional` **scripts?**: `object`[]

**Scripts anexados** (estilo MonoBehaviour — ADR-0085): comportamentos por nome
registrado + valores dos campos. O [ScriptHostSystem](../classes/ScriptHostSystem.md) roda no Play; o Inspector
adiciona/edita ("Adicionar Componente → Script"). Overlay `data.scripts[id]` vence.

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

##### vehicle.yawInertiaScale?

> `optional` **yawInertiaScale?**: `number`

Escala da inércia de curva (yaw): <1 = vira mais fácil/ágil; 1 = físico.

***

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `faces?`: `number`[][]; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `positions?`: \[`number`, `number`, `number`\][]; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `scripts?`: `object`[]; `shape?`: \{ `kind`: `"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"`; `params?`: `Record`\<`string`, `number`\>; \}; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"mesh"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \}

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

> `optional` **material?**: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

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

#### scripts?

> `optional` **scripts?**: `object`[]

**Scripts anexados** (estilo MonoBehaviour — ADR-0085): comportamentos por nome
registrado + valores dos campos. O [ScriptHostSystem](../classes/ScriptHostSystem.md) roda no Play; o Inspector
adiciona/edita ("Adicionar Componente → Script"). Overlay `data.scripts[id]` vence.

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

##### vehicle.yawInertiaScale?

> `optional` **yawInertiaScale?**: `number`

Escala da inércia de curva (yaw): <1 = vira mais fácil/ágil; 1 = físico.

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

### Type Literal

\{ `height?`: `number`; `id`: `string`; `image?`: `string`; `opacity?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `size?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"underlay"`; \}

#### height?

> `optional` **height?**: `number`

Altura acima do chão (m) — evita z-fighting com o terreno. Default 0.05.

#### id

> **id**: `string`

#### image?

> `optional` **image?**: `string`

Caminho da imagem de referência.

#### opacity?

> `optional` **opacity?**: `number`

Opacidade (0..1). Default 0.6.

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

#### size?

> `optional` **size?**: `number`

Lado do plano (m). Default 128.

#### transform?

> `optional` **transform?**: `object` = `transformSchema`

##### transform.position?

> `optional` **position?**: \[`number`, `number`, `number`\]

##### transform.rotation?

> `optional` **rotation?**: \[`number`, `number`, `number`\]

##### transform.scale?

> `optional` **scale?**: `number` \| \[`number`, `number`, `number`\]

#### type

> **type**: `"underlay"`

***

`null`
