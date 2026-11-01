[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadNodeOf

# Function: roadNodeOf()

> **roadNodeOf**(`obj`): \{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `bridge?`: \[`number`, `number`\][]; `bridgeParts?`: \{ `deck?`: `string`; `pillar?`: `string`; `pillarEvery?`: `number`; `rail?`: `string`; `scale?`: `number`; \}; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `clearance?`: `number`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `drivable?`: `boolean`; `fog?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"back"` \| `"front"` \| `"none"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `textured?`: `boolean`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `preserveGloss?`: `boolean`; `shading?`: `"bands"` \| `"cel"`; `type`: `"toon"`; \}; `matte?`: `boolean`; `maxSlope?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `points`: \[`number`, `number`, `number`\][]; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `scripts?`: `object`[]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"road"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; `visible?`: `boolean`; `width?`: `number`; \} \| `null`

Defined in: [src/scene/RoadBuild.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/RoadBuild.ts#L86)

O nó efetivo de uma estrada da cena, ou `null` se `obj` não é estrada.

## Parameters

### obj

`Object3D`

## Returns

### Type Literal

\{ `animation?`: \{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \}; `animations?`: `Record`\<`string`, `string`\>; `attach?`: \{ `socket`: `string`; `to`: `string`; `toSocket`: `string`; \}; `bridge?`: \[`number`, `number`\][]; `bridgeParts?`: \{ `deck?`: `string`; `pillar?`: `string`; `pillarEvery?`: `number`; `rail?`: `string`; `scale?`: `number`; \}; `castShadow?`: `boolean`; `character?`: \{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \}; `clearance?`: `number`; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `color?`: `string` \| `number`; `drivable?`: `boolean`; `fog?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `id`: `string`; `material?`: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"back"` \| `"front"` \| `"none"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `textured?`: `boolean`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `preserveGloss?`: `boolean`; `shading?`: `"bands"` \| `"cel"`; `type`: `"toon"`; \}; `matte?`: `boolean`; `maxSlope?`: `number`; `place?`: \{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `player?`: `boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \}; `points`: \[`number`, `number`, `number`\][]; `rapierBody?`: \{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \}; `receiveShadow?`: `boolean`; `scripts?`: `object`[]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `transform?`: \{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \}; `type`: `"road"`; `vehicle?`: \{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \}; `visible?`: `boolean`; `width?`: `number`; \}

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

Encaixe por socket no lugar de coordenadas (ver attachSchema; ADR-0053).

##### attach.socket

> **socket**: `string`

Socket PRÓPRIO (nome de âncora no `kit.json` deste asset).

##### attach.to

> **to**: `string`

`id` do nó alvo na cena.

##### attach.toSocket

> **toSocket**: `string`

Socket do ALVO (nome de âncora no `kit.json` do asset do alvo).

#### bridge?

> `optional` **bridge?**: \[`number`, `number`\][]

Trechos de ponte `[i0, i1]` por índice de `points`: sem corte/aterro, greide reto (SPEC-0631 §3c).

#### bridgeParts?

> `optional` **bridgeParts?**: `object`

Peças da ponte nos vãos `bridge` (SPEC-0631 §3d, ADR-0648). Sem isto, o vão é só a fita.

##### bridgeParts.deck?

> `optional` **deck?**: `string`

Peça de pista (topo em y = 0, comprimento em Z), repetida e esticada para fechar o vão.

##### bridgeParts.pillar?

> `optional` **pillar?**: `string`

Pilar (topo em y = 0, cresce para baixo), esticado até o chão nas juntas.

##### bridgeParts.pillarEvery?

> `optional` **pillarEvery?**: `number`

Pilar a cada N peças de pista. Default 2.

##### bridgeParts.rail?

> `optional` **rail?**: `string`

Guarda-corpo (base em y = 0), repetido nas duas bordas.

##### bridgeParts.scale?

> `optional` **scale?**: `number`

Escala de pista e pilar. Default 1.

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

#### clearance?

> `optional` **clearance?**: `number`

Faixa (m) além da borda da pista sem vegetação (SPEC-0631 §3b). Default [ROAD\_DEFAULT\_CLEARANCE](../variables/ROAD_DEFAULT_CLEARANCE.md).

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

> `optional` **shape?**: `"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"`

##### collider.solid?

> `optional` **solid?**: `boolean`

##### collider.width?

> `optional` **width?**: `number`

#### color?

> `optional` **color?**: `string` \| `number`

Cor da pista (sem textura). Com textura, o default é branco.

#### drivable?

> `optional` **drivable?**: `boolean`

Chão do carro (`userData.cortexRoad`). Default true.

#### fog?

> `optional` **fog?**: `boolean`

`false` = a névoa da cena (`fog`) NÃO tinge este objeto.

A névoa é global e some com tudo que está longe — inclusive com o que está
longe **de propósito**: um planeta, uma montanha ou um marco de horizonte
cuja função é justamente ser lido à distância. Isentá-los devolve a cor
própria da peça sem abrir mão da profundidade no resto da cena.

Omitido = o objeto recebe a névoa (o comportamento normal).

#### grade?

> `optional` **grade?**: `"points"` \| `"terrain"`

De onde vem o greide: base do terreno (default) ou o Y dos pontos.

#### id

> **id**: `string`

Identificador único — chave pra overlay/editor e `Object3D.name`.

#### material?

> `optional` **material?**: \{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"back"` \| `"front"` \| `"none"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `textured?`: `boolean`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `preserveGloss?`: `boolean`; `shading?`: `"bands"` \| `"cel"`; `type`: `"toon"`; \} = `materialSchema`

Material/shader por objeto (standard/unlit/toon). Ver [applyMaterial](applyMaterial.md).

#### matte?

> `optional` **matte?**: `boolean`

Materiais foscos (mata o brilho PBR → look cartoon). Ver [setMatte](setMatte.md).

#### maxSlope?

> `optional` **maxSlope?**: `number`

Inclinação máxima do greide (Δy/Δhorizontal; 0.25 = 25%). Default 0.25.

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

#### points

> **points**: \[`number`, `number`, `number`\][]

Pontos da curva (≥2), `[x, y, z]` em metros, coordenadas de mundo.

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

#### smooth?

> `optional` **smooth?**: `number`

Janela da média móvel do greide (m). Default 12.

#### steps?

> `optional` **steps?**: `number`

Amostras por 90° de curva. Default 16.

#### talude?

> `optional` **talude?**: `number`

Talude por lado (m): rampa do platô até o terreno original. Default [ROAD\_DEFAULT\_TALUDE](../variables/ROAD_DEFAULT_TALUDE.md).

#### texture?

> `optional` **texture?**: `string`

Textura tileável da pista (caminho do projeto). Ausente = só cor.

#### tile?

> `optional` **tile?**: `number`

Metros de pista por repetição da textura. Default 8.

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

#### visible?

> `optional` **visible?**: `boolean`

`false` = mesh não renderizado (invisível), mas ainda presente na física/raycast.

#### width?

> `optional` **width?**: `number`

Largura total da pista (m). Default [ROAD\_DEFAULT\_WIDTH](../variables/ROAD_DEFAULT_WIDTH.md).

***

`null`
