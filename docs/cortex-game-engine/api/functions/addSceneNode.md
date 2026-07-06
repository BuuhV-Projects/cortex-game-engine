[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / addSceneNode

# Function: addSceneNode()

> **addSceneNode**(`scene`, `node`): `Promise`\<`Object3D`\<`Object3DEventMap`\> \| `null`\>

Defined in: [src/scene/SceneBuilder.ts:780](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L780)

Instancia UM nó de cena e o adiciona à `scene` (modelo `.glb`, primitiva, luz
ou água), já nomeado por `id` e com `place`/`transform` aplicado. Usado pelo
[buildScene](buildScene.md) e pelo editor pra **adicionar um objeto ao vivo** (F2).

Nota: água adicionada por aqui não é animada (sem o tick do `buildScene`) até
recarregar — adicionar água ao vivo é caso raro.

## Parameters

### scene

[`Scene`](../classes/Scene.md)

### node

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `scripts?`: `object`[]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \} \| \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `scripts?`: `object`[]; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \} \| \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `faces?`: `number`[][]; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `positions?`: \[`number`, `number`, `number`\][]; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `scripts?`: `object`[]; `shape?`: \{ `kind`: `"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"`; `params?`: `Record`\<`string`, `number`\>; \}; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"mesh"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \} \| \{ `castShadow?`: `boolean`; `color?`: `string` \| `number`; `groundColor?`: `string` \| `number`; `id`: `string`; `intensity?`: `number`; `light`: `"directional"` \| `"hemisphere"` \| `"ambient"`; `position?`: \[`number`, `number`, `number`\]; `type`: `"light"`; \} \| \{ `causticsIntensity?`: `number`; `causticsUrl?`: `string`; `color?`: `string` \| `number`; `flowSpeed?`: \[`number`, `number`\]; `id`: `string`; `repeat?`: `number`; `type`: `"water"`; `y?`: `number`; \} \| \{ `distance?`: `number`; `height?`: `number`; `id`: `string`; `image`: `string`; `parallax?`: `number`; `type`: `"background"`; `widthFactor?`: `number`; \} \| \{ `alphaTest?`: `number`; `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `height?`: `number`; `id`: `string`; `initial?`: `string`; `pixelated?`: `boolean`; `pixelsPerUnit?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `rows?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"sprite"`; `url`: `string`; `width?`: `number`; \} \| \{ `color?`: `string` \| `number`; `heights?`: `number`[]; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `resolution?`: `number`; `size?`: `number` \| \[`number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"terrain"`; \} \| \{ `capacity?`: `number`; `collide?`: `boolean`; `id`: `string`; `instances?`: `number`[]; `kind?`: `"tree"` \| `"grass"`; `model?`: `string`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"vegetation"`; \} \| \{ `height?`: `number`; `id`: `string`; `image?`: `string`; `opacity?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `size?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"underlay"`; \}

#### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `scripts?`: `object`[]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"model"`; `url`: `string`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \}

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

##### castShadow?

`boolean` = `...`

##### character?

\{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \} = `characterSchema`

Marca como **Character** (cápsula + gravidade + pulo + step, estilo UPBGE). Ver [CharacterConfig](../type-aliases/CharacterConfig.md).

##### character.fallSpeedMax?

`number` = `...`

##### character.gravity?

`number` = `...`

##### character.groundY?

`number` = `...`

Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real.

##### character.height?

`number` = `...`

##### character.jumpForce?

`number` = `...`

##### character.maxJumps?

`number` = `...`

##### character.radius?

`number` = `...`

##### character.stepHeight?

`number` = `...`

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

##### material?

\{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

Material/shader por objeto (standard/unlit/toon). Ver [applyMaterial](applyMaterial.md).

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

##### rapierBody?

\{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \} = `rapierBodySchema`

Marca como **corpo rígido do Rapier** (física dinâmica 3D — cai/empilha/empurra). Ver [RapierBodyConfig](../type-aliases/RapierBodyConfig.md).

##### rapierBody.bodyType?

`"dynamic"` \| `"fixed"` \| `"kinematic"` = `...`

##### rapierBody.friction?

`number` = `...`

##### rapierBody.isSensor?

`boolean` = `...`

##### rapierBody.restitution?

`number` = `...`

##### rapierBody.shape?

\{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \} = `...`

##### receiveShadow?

`boolean` = `...`

##### scripts?

`object`[] = `...`

**Scripts anexados** (estilo MonoBehaviour — ADR-0085): comportamentos por nome
registrado + valores dos campos. O [ScriptHostSystem](../classes/ScriptHostSystem.md) roda no Play; o Inspector
adiciona/edita ("Adicionar Componente → Script"). Overlay `data.scripts[id]` vence.

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

##### vehicle?

\{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \} = `vehicleSchema`

Config do **veículo** (motor/freio/suspensão/centro de massa) — editável no Inspector. Ver ADR-0081.

##### vehicle.centerOfMass?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

Centro de massa: y = altura (BAIXO = estável, não capota), z = frente/trás.

##### vehicle.centerOfMass.x?

`number` = `...`

##### vehicle.centerOfMass.y?

`number` = `...`

##### vehicle.centerOfMass.z?

`number` = `...`

##### vehicle.chassisHalfExtents?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

##### vehicle.chassisHalfExtents.x?

`number` = `...`

##### vehicle.chassisHalfExtents.y?

`number` = `...`

##### vehicle.chassisHalfExtents.z?

`number` = `...`

##### vehicle.chassisOffset?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

Posição da caixa do chassi (collider) relativa à origem.

##### vehicle.chassisOffset.x?

`number` = `...`

##### vehicle.chassisOffset.y?

`number` = `...`

##### vehicle.chassisOffset.z?

`number` = `...`

##### vehicle.engineForce?

`number` = `...`

##### vehicle.engineLayers?

\{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \} = `...`

Áudio do motor em CAMADAS (crossfade on/off × faixas de RPM) — som realista.
Cada slot é um caminho de áudio (loop). Tem prioridade sobre `engineSound`.

##### vehicle.engineLayers.offHigh?

`string` = `...`

##### vehicle.engineLayers.offLow?

`string` = `...`

##### vehicle.engineLayers.offMid?

`string` = `...`

##### vehicle.engineLayers.offVeryHigh?

`string` = `...`

##### vehicle.engineLayers.onHigh?

`string` = `...`

##### vehicle.engineLayers.onLow?

`string` = `...`

##### vehicle.engineLayers.onMid?

`string` = `...`

##### vehicle.engineSound?

`string` = `...`

Caminho do áudio do MOTOR (loop único — fallback simples). Ver [EngineSound](../classes/EngineSound.md).

##### vehicle.frictionSlip?

`number` = `...`

##### vehicle.handbrakeForce?

`number` = `...`

##### vehicle.mass?

`number` = `...`

##### vehicle.maxBrake?

`number` = `...`

##### vehicle.maxReverseSpeed?

`number` = `...`

##### vehicle.maxSpeed?

`number` = `...`

Velocidade no fim do velocímetro (km/h).

##### vehicle.maxSteer?

`number` = `...`

##### vehicle.maxSuspensionTravel?

`number` = `...`

##### vehicle.reverseForce?

`number` = `...`

##### vehicle.rollingResistance?

`number` = `...`

##### vehicle.steerSmooth?

`number` = `...`

##### vehicle.suspensionCompression?

`number` = `...`

##### vehicle.suspensionRelaxation?

`number` = `...`

##### vehicle.suspensionRestLength?

`number` = `...`

Altura/curso de repouso da suspensão.

##### vehicle.suspensionStiffness?

`number` = `...`

Sensibilidade da suspensão (rigidez).

##### vehicle.throttleSmooth?

`number` = `...`

##### vehicle.wheelSpinRate?

`number` = `...`

##### vehicle.yawInertiaScale?

`number` = `...`

Escala da inércia de curva (yaw): <1 = vira mais fácil/ágil; 1 = físico.

***

#### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `scripts?`: `object`[]; `shape`: `"box"` \| `"sphere"` \| `"cylinder"` \| `"plane"`; `size?`: `number` \| \[`number`, `number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"primitive"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \}

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

##### castShadow?

`boolean` = `...`

##### character?

\{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \} = `characterSchema`

Marca como **Character** (cápsula + gravidade + pulo + step, estilo UPBGE). Ver [CharacterConfig](../type-aliases/CharacterConfig.md).

##### character.fallSpeedMax?

`number` = `...`

##### character.gravity?

`number` = `...`

##### character.groundY?

`number` = `...`

Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real.

##### character.height?

`number` = `...`

##### character.jumpForce?

`number` = `...`

##### character.maxJumps?

`number` = `...`

##### character.radius?

`number` = `...`

##### character.stepHeight?

`number` = `...`

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

##### material?

\{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

Material/shader por objeto (standard/unlit/toon). Ver [applyMaterial](applyMaterial.md).

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

##### rapierBody?

\{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \} = `rapierBodySchema`

Marca como **corpo rígido do Rapier** (física dinâmica 3D — cai/empilha/empurra). Ver [RapierBodyConfig](../type-aliases/RapierBodyConfig.md).

##### rapierBody.bodyType?

`"dynamic"` \| `"fixed"` \| `"kinematic"` = `...`

##### rapierBody.friction?

`number` = `...`

##### rapierBody.isSensor?

`boolean` = `...`

##### rapierBody.restitution?

`number` = `...`

##### rapierBody.shape?

\{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \} = `...`

##### receiveShadow?

`boolean` = `...`

##### roughness?

`number` = `...`

##### scripts?

`object`[] = `...`

**Scripts anexados** (estilo MonoBehaviour — ADR-0085): comportamentos por nome
registrado + valores dos campos. O [ScriptHostSystem](../classes/ScriptHostSystem.md) roda no Play; o Inspector
adiciona/edita ("Adicionar Componente → Script"). Overlay `data.scripts[id]` vence.

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

##### vehicle?

\{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \} = `vehicleSchema`

Config do **veículo** (motor/freio/suspensão/centro de massa) — editável no Inspector. Ver ADR-0081.

##### vehicle.centerOfMass?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

Centro de massa: y = altura (BAIXO = estável, não capota), z = frente/trás.

##### vehicle.centerOfMass.x?

`number` = `...`

##### vehicle.centerOfMass.y?

`number` = `...`

##### vehicle.centerOfMass.z?

`number` = `...`

##### vehicle.chassisHalfExtents?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

##### vehicle.chassisHalfExtents.x?

`number` = `...`

##### vehicle.chassisHalfExtents.y?

`number` = `...`

##### vehicle.chassisHalfExtents.z?

`number` = `...`

##### vehicle.chassisOffset?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

Posição da caixa do chassi (collider) relativa à origem.

##### vehicle.chassisOffset.x?

`number` = `...`

##### vehicle.chassisOffset.y?

`number` = `...`

##### vehicle.chassisOffset.z?

`number` = `...`

##### vehicle.engineForce?

`number` = `...`

##### vehicle.engineLayers?

\{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \} = `...`

Áudio do motor em CAMADAS (crossfade on/off × faixas de RPM) — som realista.
Cada slot é um caminho de áudio (loop). Tem prioridade sobre `engineSound`.

##### vehicle.engineLayers.offHigh?

`string` = `...`

##### vehicle.engineLayers.offLow?

`string` = `...`

##### vehicle.engineLayers.offMid?

`string` = `...`

##### vehicle.engineLayers.offVeryHigh?

`string` = `...`

##### vehicle.engineLayers.onHigh?

`string` = `...`

##### vehicle.engineLayers.onLow?

`string` = `...`

##### vehicle.engineLayers.onMid?

`string` = `...`

##### vehicle.engineSound?

`string` = `...`

Caminho do áudio do MOTOR (loop único — fallback simples). Ver [EngineSound](../classes/EngineSound.md).

##### vehicle.frictionSlip?

`number` = `...`

##### vehicle.handbrakeForce?

`number` = `...`

##### vehicle.mass?

`number` = `...`

##### vehicle.maxBrake?

`number` = `...`

##### vehicle.maxReverseSpeed?

`number` = `...`

##### vehicle.maxSpeed?

`number` = `...`

Velocidade no fim do velocímetro (km/h).

##### vehicle.maxSteer?

`number` = `...`

##### vehicle.maxSuspensionTravel?

`number` = `...`

##### vehicle.reverseForce?

`number` = `...`

##### vehicle.rollingResistance?

`number` = `...`

##### vehicle.steerSmooth?

`number` = `...`

##### vehicle.suspensionCompression?

`number` = `...`

##### vehicle.suspensionRelaxation?

`number` = `...`

##### vehicle.suspensionRestLength?

`number` = `...`

Altura/curso de repouso da suspensão.

##### vehicle.suspensionStiffness?

`number` = `...`

Sensibilidade da suspensão (rigidez).

##### vehicle.throttleSmooth?

`number` = `...`

##### vehicle.wheelSpinRate?

`number` = `...`

##### vehicle.yawInertiaScale?

`number` = `...`

Escala da inércia de curva (yaw): <1 = vira mais fácil/ágil; 1 = físico.

***

#### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `faces?`: `number`[][]; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \}; `matte?`: `boolean`; `metalness?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `positions?`: \[`number`, `number`, `number`\][]; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `roughness?`: `number`; `scripts?`: `object`[]; `shape?`: \{ `kind`: `"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"`; `params?`: `Record`\<`string`, `number`\>; \}; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"mesh"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; \}

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

##### castShadow?

`boolean` = `...`

##### character?

\{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \} = `characterSchema`

Marca como **Character** (cápsula + gravidade + pulo + step, estilo UPBGE). Ver [CharacterConfig](../type-aliases/CharacterConfig.md).

##### character.fallSpeedMax?

`number` = `...`

##### character.gravity?

`number` = `...`

##### character.groundY?

`number` = `...`

Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real.

##### character.height?

`number` = `...`

##### character.jumpForce?

`number` = `...`

##### character.maxJumps?

`number` = `...`

##### character.radius?

`number` = `...`

##### character.stepHeight?

`number` = `...`

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

##### faces?

`number`[][] = `...`

Faces poligonais (índices em `positions`), em ordem CCW.

##### id

`string` = `...`

Identificador único — chave pra overlay/editor e `Object3D.name`.

##### material?

\{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"none"` \| `"back"` \| `"front"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `type`: `"toon"`; \} = `materialSchema`

Material/shader por objeto (standard/unlit/toon). Ver [applyMaterial](applyMaterial.md).

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

##### positions?

\[`number`, `number`, `number`\][] = `...`

Vértices lógicos (malha freeform). Usado quando não há `shape`.

##### rapierBody?

\{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \} = `rapierBodySchema`

Marca como **corpo rígido do Rapier** (física dinâmica 3D — cai/empilha/empurra). Ver [RapierBodyConfig](../type-aliases/RapierBodyConfig.md).

##### rapierBody.bodyType?

`"dynamic"` \| `"fixed"` \| `"kinematic"` = `...`

##### rapierBody.friction?

`number` = `...`

##### rapierBody.isSensor?

`boolean` = `...`

##### rapierBody.restitution?

`number` = `...`

##### rapierBody.shape?

\{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \} = `...`

##### receiveShadow?

`boolean` = `...`

##### roughness?

`number` = `...`

##### scripts?

`object`[] = `...`

**Scripts anexados** (estilo MonoBehaviour — ADR-0085): comportamentos por nome
registrado + valores dos campos. O [ScriptHostSystem](../classes/ScriptHostSystem.md) roda no Play; o Inspector
adiciona/edita ("Adicionar Componente → Script"). Overlay `data.scripts[id]` vence.

##### shape?

\{ `kind`: `"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"`; `params?`: `Record`\<`string`, `number`\>; \} = `...`

##### shape.kind

`"sphere"` \| `"cylinder"` \| `"plane"` \| `"cube"` \| `"cone"` \| `"stairs"` \| `"ramp"` \| `"arch"` \| `"wallOpening"` = `...`

##### shape.params?

`Record`\<`string`, `number`\> = `...`

##### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

##### transform.position?

\[`number`, `number`, `number`\] = `...`

##### transform.rotation?

\[`number`, `number`, `number`\] = `...`

##### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

##### type

`"mesh"` = `...`

##### vehicle?

\{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \} = `vehicleSchema`

Config do **veículo** (motor/freio/suspensão/centro de massa) — editável no Inspector. Ver ADR-0081.

##### vehicle.centerOfMass?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

Centro de massa: y = altura (BAIXO = estável, não capota), z = frente/trás.

##### vehicle.centerOfMass.x?

`number` = `...`

##### vehicle.centerOfMass.y?

`number` = `...`

##### vehicle.centerOfMass.z?

`number` = `...`

##### vehicle.chassisHalfExtents?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

##### vehicle.chassisHalfExtents.x?

`number` = `...`

##### vehicle.chassisHalfExtents.y?

`number` = `...`

##### vehicle.chassisHalfExtents.z?

`number` = `...`

##### vehicle.chassisOffset?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

Posição da caixa do chassi (collider) relativa à origem.

##### vehicle.chassisOffset.x?

`number` = `...`

##### vehicle.chassisOffset.y?

`number` = `...`

##### vehicle.chassisOffset.z?

`number` = `...`

##### vehicle.engineForce?

`number` = `...`

##### vehicle.engineLayers?

\{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \} = `...`

Áudio do motor em CAMADAS (crossfade on/off × faixas de RPM) — som realista.
Cada slot é um caminho de áudio (loop). Tem prioridade sobre `engineSound`.

##### vehicle.engineLayers.offHigh?

`string` = `...`

##### vehicle.engineLayers.offLow?

`string` = `...`

##### vehicle.engineLayers.offMid?

`string` = `...`

##### vehicle.engineLayers.offVeryHigh?

`string` = `...`

##### vehicle.engineLayers.onHigh?

`string` = `...`

##### vehicle.engineLayers.onLow?

`string` = `...`

##### vehicle.engineLayers.onMid?

`string` = `...`

##### vehicle.engineSound?

`string` = `...`

Caminho do áudio do MOTOR (loop único — fallback simples). Ver [EngineSound](../classes/EngineSound.md).

##### vehicle.frictionSlip?

`number` = `...`

##### vehicle.handbrakeForce?

`number` = `...`

##### vehicle.mass?

`number` = `...`

##### vehicle.maxBrake?

`number` = `...`

##### vehicle.maxReverseSpeed?

`number` = `...`

##### vehicle.maxSpeed?

`number` = `...`

Velocidade no fim do velocímetro (km/h).

##### vehicle.maxSteer?

`number` = `...`

##### vehicle.maxSuspensionTravel?

`number` = `...`

##### vehicle.reverseForce?

`number` = `...`

##### vehicle.rollingResistance?

`number` = `...`

##### vehicle.steerSmooth?

`number` = `...`

##### vehicle.suspensionCompression?

`number` = `...`

##### vehicle.suspensionRelaxation?

`number` = `...`

##### vehicle.suspensionRestLength?

`number` = `...`

Altura/curso de repouso da suspensão.

##### vehicle.suspensionStiffness?

`number` = `...`

Sensibilidade da suspensão (rigidez).

##### vehicle.throttleSmooth?

`number` = `...`

##### vehicle.wheelSpinRate?

`number` = `...`

##### vehicle.yawInertiaScale?

`number` = `...`

Escala da inércia de curva (yaw): <1 = vira mais fácil/ágil; 1 = físico.

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

***

#### Type Literal

\{ `alphaTest?`: `number`; `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `height?`: `number`; `id`: `string`; `initial?`: `string`; `pixelated?`: `boolean`; `pixelsPerUnit?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `rows?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"sprite"`; `url`: `string`; `width?`: `number`; \}

##### alphaTest?

`number` = `...`

Recorte por alpha (0 = sem corte; 0.5 bom pra borda dura). Default 0.5.

##### animations?

`Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\> = `...`

Animações nomeadas (`{ idle: { frames: [0], fps: 4 }, run: {...} }`).

##### columns?

`number` = `...`

Alternativa a frameWidth: nº de colunas (frame = larguraTex / columns).

##### frameHeight?

`number` = `...`

Altura de um frame em px (spritesheet).

##### frameWidth?

`number` = `...`

Largura de um frame em px (spritesheet). Omitir = imagem inteira é 1 frame.

##### height?

`number` = `...`

Altura em unidades de mundo.

##### id

`string` = `...`

##### initial?

`string` = `...`

Animação inicial a tocar.

##### pixelated?

`boolean` = `...`

Nearest filter (pixel art). Default true.

##### pixelsPerUnit?

`number` = `...`

Px por unidade de mundo pra dimensionar o sprite. Default 100.

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

##### rows?

`number` = `...`

Alternativa a frameHeight: nº de linhas.

##### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

##### transform.position?

\[`number`, `number`, `number`\] = `...`

##### transform.rotation?

\[`number`, `number`, `number`\] = `...`

##### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

##### type

`"sprite"` = `...`

##### url

`string` = `...`

URL da imagem (png/jpg/webp) — o sprite ou a spritesheet.

##### width?

`number` = `...`

Largura em unidades de mundo (sobrescreve o cálculo por pixelsPerUnit).

***

#### Type Literal

\{ `color?`: `string` \| `number`; `heights?`: `number`[]; `id`: `string`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `resolution?`: `number`; `size?`: `number` \| \[`number`, `number`\]; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"terrain"`; \}

##### color?

`string` \| `number` = `...`

Cor base do material. Default verde-grama.

##### heights?

`number`[] = `...`

Heightmap (row-major, `(res+1)²` alturas) — autoria do editor.

##### id

`string` = `...`

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

##### resolution?

`number` = `...`

Segmentos por lado (resolução da grade). Default 64.

##### size?

`number` \| \[`number`, `number`\] = `...`

Largura × profundidade (XZ) em unidades. Número = quadrado. Default 50.

##### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

##### transform.position?

\[`number`, `number`, `number`\] = `...`

##### transform.rotation?

\[`number`, `number`, `number`\] = `...`

##### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

##### type

`"terrain"` = `...`

***

#### Type Literal

\{ `capacity?`: `number`; `collide?`: `boolean`; `id`: `string`; `instances?`: `number`[]; `kind?`: `"tree"` \| `"grass"`; `model?`: `string`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"vegetation"`; \}

##### capacity?

`number` = `...`

Capacidade máxima de instâncias (buffer pré-alocado). Default 8192.

##### collide?

`boolean` = `...`

Colide com o player (vira `cortexSolid` — o personagem é empurrado pra fora dos
troncos). Default: liga pra árvores/modelos, desliga pra `kind: 'grass'`.

##### id

`string` = `...`

##### instances?

`number`[] = `...`

Instâncias espalhadas: plano `[x,y,z,rotY,scale]` por instância.

##### kind?

`"tree"` \| `"grass"` = `...`

Placeholder quando sem `model`: `tree` (default) ou `grass`.

##### model?

`string` = `...`

URL do `.glb` do modelo. Omitido = placeholder procedural (ver `kind`).

##### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

##### transform.position?

\[`number`, `number`, `number`\] = `...`

##### transform.rotation?

\[`number`, `number`, `number`\] = `...`

##### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

##### type

`"vegetation"` = `...`

***

#### Type Literal

\{ `height?`: `number`; `id`: `string`; `image?`: `string`; `opacity?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `size?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"underlay"`; \}

##### height?

`number` = `...`

Altura acima do chão (m) — evita z-fighting com o terreno. Default 0.05.

##### id

`string` = `...`

##### image?

`string` = `...`

Caminho da imagem de referência.

##### opacity?

`number` = `...`

Opacidade (0..1). Default 0.6.

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

##### size?

`number` = `...`

Lado do plano (m). Default 128.

##### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

##### transform.position?

\[`number`, `number`, `number`\] = `...`

##### transform.rotation?

\[`number`, `number`, `number`\] = `...`

##### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

##### type

`"underlay"` = `...`

## Returns

`Promise`\<`Object3D`\<`Object3DEventMap`\> \| `null`\>

O `Object3D` criado, ou `null` se o tipo for desconhecido.
