[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / applyRoad

# Function: applyRoad()

> **applyRoad**(`mesh`, `node`, `three`, `terrains?`): `Promise`\<`void`\>

Defined in: [src/scene/RoadBuild.ts:191](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/RoadBuild.ts#L191)

(Re)gera a pista de `mesh` a partir do nó: spline → greide (base do terreno ou Y dos
pontos, alisado e limitado) → fita + material. Guarda o eixo pro corte e liga/desliga
`userData.cortexRoad` (`drivable`). Não molda o terreno — chame
[moldTerrainToRoads](moldTerrainToRoads.md) depois (ou [buildRoads](buildRoads.md)).

A malha fica em coordenadas de mundo: o transform do objeto é zerado (SPEC-0631 §1).
A promessa resolve quando as peças da ponte (`bridgeParts`, §3d) estão no lugar; a pista
em si já está pronta no retorno.

## Parameters

### mesh

`Mesh`

### node

#### animation?

\{ `autoplay?`: `boolean`; `clip?`: `string`; `loop?`: `boolean`; `speed?`: `number`; \} = `animationSchema`

Animação do modelo `.glb` (clipe a tocar, loop, velocidade). Ver [SceneAnimator](../classes/SceneAnimator.md).

#### animation.autoplay?

`boolean` = `...`

#### animation.clip?

`string` = `...`

#### animation.loop?

`boolean` = `...`

#### animation.speed?

`number` = `...`

#### animations?

`Record`\<`string`, `string`\> = `...`

**Mapa ação→clipe do player** (`{ idle, walk, run, jump, fall, ... }`) — quando o
nó é `player`, o [PlatformerAnimationSystem](../classes/PlatformerAnimationSystem.md) toca a animação certa por
estado. Ausentes são auto-mapeados pelos nomes dos clipes. Ver
[PlayerAnimatorComponent](../classes/PlayerAnimatorComponent.md).

#### attach?

\{ `socket`: `string`; `to`: `string`; `toSocket`: `string`; \} = `attachSchema`

Encaixe por socket no lugar de coordenadas (ver attachSchema; ADR-0053).

#### attach.socket

`string` = `...`

Socket PRÓPRIO (nome de âncora no `kit.json` deste asset).

#### attach.to

`string` = `...`

`id` do nó alvo na cena.

#### attach.toSocket

`string` = `...`

Socket do ALVO (nome de âncora no `kit.json` do asset do alvo).

#### bridge?

\[`number`, `number`\][] = `...`

Trechos de ponte `[i0, i1]` por índice de `points`: sem corte/aterro, greide reto (SPEC-0631 §3c).

#### bridgeParts?

\{ `deck?`: `string`; `pillar?`: `string`; `pillarEvery?`: `number`; `rail?`: `string`; `scale?`: `number`; \} = `...`

Peças da ponte nos vãos `bridge` (SPEC-0631 §3d, ADR-0649). Sem isto, o vão é só a fita.

#### bridgeParts.deck?

`string` = `...`

Peça de pista (topo em y = 0, comprimento em Z), repetida e esticada para fechar o vão.

#### bridgeParts.pillar?

`string` = `...`

Pilar (topo em y = 0, cresce para baixo), esticado até o chão nas juntas.

#### bridgeParts.pillarEvery?

`number` = `...`

Pilar a cada N peças de pista. Default 2.

#### bridgeParts.rail?

`string` = `...`

Guarda-corpo (base em y = 0), repetido nas duas bordas.

#### bridgeParts.scale?

`number` = `...`

Escala de pista e pilar. Default 1.

#### castShadow?

`boolean` = `...`

#### character?

\{ `fallSpeedMax?`: `number`; `gravity?`: `number`; `groundY?`: `number`; `height?`: `number`; `jumpForce?`: `number`; `maxJumps?`: `number`; `radius?`: `number`; `stepHeight?`: `number`; \} = `characterSchema`

Marca como **Character** (cápsula + gravidade + pulo + step, estilo UPBGE). Ver [CharacterConfig](../type-aliases/CharacterConfig.md).

#### character.fallSpeedMax?

`number` = `...`

#### character.gravity?

`number` = `...`

#### character.groundY?

`number` = `...`

Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real.

#### character.height?

`number` = `...`

#### character.jumpForce?

`number` = `...`

#### character.maxJumps?

`number` = `...`

#### character.radius?

`number` = `...`

#### character.stepHeight?

`number` = `...`

#### clearance?

`number` = `...`

Faixa (m) além da borda da pista sem vegetação (SPEC-0631 §3b). Default [ROAD\_DEFAULT\_CLEARANCE](../variables/ROAD_DEFAULT_CLEARANCE.md).

#### collider?

\{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \} = `colliderSchema`

Collider 2D (plataformer): vira sólido/plataforma.

#### collider.height?

`number` = `...`

#### collider.offsetX?

`number` = `...`

#### collider.offsetY?

`number` = `...`

#### collider.oneWay?

`boolean` = `...`

#### collider.points?

\[`number`, `number`\][] = `...`

Perfil do chão (LOCAL, ordenado por X) quando `shape` é `heightfield`.

#### collider.shape?

`"box"` \| `"circle"` \| `"capsule"` \| `"heightfield"` = `...`

#### collider.solid?

`boolean` = `...`

#### collider.width?

`number` = `...`

#### color?

`string` \| `number` = `...`

Cor da pista (sem textura). Com textura, o default é branco.

#### drivable?

`boolean` = `...`

Chão do carro (`userData.cortexRoad`). Default true.

#### fog?

`boolean` = `...`

`false` = a névoa da cena (`fog`) NÃO tinge este objeto.

A névoa é global e some com tudo que está longe — inclusive com o que está
longe **de propósito**: um planeta, uma montanha ou um marco de horizonte
cuja função é justamente ser lido à distância. Isentá-los devolve a cor
própria da peça sem abrir mão da profundidade no resto da cena.

Omitido = o objeto recebe a névoa (o comportamento normal).

#### grade?

`"points"` \| `"terrain"` = `...`

De onde vem o greide: base do terreno (default) ou o Y dos pontos.

#### id

`string` = `...`

Identificador único — chave pra overlay/editor e `Object3D.name`.

#### material?

\{ `type`: `"standard"`; \} \| \{ `alphaTest?`: `number`; `color?`: `string` \| `number`; `cull?`: `"back"` \| `"front"` \| `"none"`; `depthTest?`: `boolean`; `depthWrite?`: `boolean`; `opacity?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `textured?`: `boolean`; `transparent?`: `boolean`; `type`: `"unlit"`; \} \| \{ `color?`: `string` \| `number`; `gradientSteps?`: `number`; `outline?`: `number`; `outlineColor?`: `string` \| `number`; `preserveGloss?`: `boolean`; `shading?`: `"bands"` \| `"cel"`; `type`: `"toon"`; \} = `materialSchema`

Material/shader por objeto (standard/unlit/toon). Ver [applyMaterial](applyMaterial.md).

#### matte?

`boolean` = `...`

Materiais foscos (mata o brilho PBR → look cartoon). Ver [setMatte](setMatte.md).

#### maxSlope?

`number` = `...`

Inclinação máxima do greide (Δy/Δhorizontal; 0.25 = 25%). Default 0.25.

#### place?

\{ `rotY?`: `number`; `scale?`: `number`; `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `placeSchema`

#### place.rotY?

`number` = `...`

#### place.scale?

`number` = `...`

#### place.x?

`number` = `...`

#### place.y?

`number` = `...`

#### place.z?

`number` = `...`

#### player?

`boolean` \| \{ `gravity?`: `number`; `jumpSpeed?`: `number`; `maxFall?`: `number`; `moveSpeed?`: `number`; \} = `playerSchema`

Marca como player (controller + corpo + alvo da câmera).

#### points

\[`number`, `number`, `number`\][] = `...`

Pontos da curva (≥2), `[x, y, z]` em metros, coordenadas de mundo.

#### rapierBody?

\{ `bodyType?`: `"dynamic"` \| `"fixed"` \| `"kinematic"`; `friction?`: `number`; `isSensor?`: `boolean`; `restitution?`: `number`; `shape?`: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}; \} = `rapierBodySchema`

Marca como **corpo rígido do Rapier** (física dinâmica 3D — cai/empilha/empurra). Ver [RapierBodyConfig](../type-aliases/RapierBodyConfig.md).

#### rapierBody.bodyType?

`"dynamic"` \| `"fixed"` \| `"kinematic"` = `...`

#### rapierBody.friction?

`number` = `...`

#### rapierBody.isSensor?

`boolean` = `...`

#### rapierBody.restitution?

`number` = `...`

#### rapierBody.shape?

\{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \} = `...`

#### receiveShadow?

`boolean` = `...`

#### scripts?

`object`[] = `...`

**Scripts anexados** (estilo MonoBehaviour — ADR-0085): comportamentos por nome
registrado + valores dos campos. O [ScriptHostSystem](../classes/ScriptHostSystem.md) roda no Play; o Inspector
adiciona/edita ("Adicionar Componente → Script"). Overlay `data.scripts[id]` vence.

#### smooth?

`number` = `...`

Janela da média móvel do greide (m). Default 12.

#### steps?

`number` = `...`

Amostras por 90° de curva. Default 16.

#### talude?

`number` = `...`

Talude por lado (m): rampa do platô até o terreno original. Default [ROAD\_DEFAULT\_TALUDE](../variables/ROAD_DEFAULT_TALUDE.md).

#### texture?

`string` = `...`

Textura tileável da pista (caminho do projeto). Ausente = só cor.

#### tile?

`number` = `...`

Metros de pista por repetição da textura. Default 8.

#### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

#### transform.position?

\[`number`, `number`, `number`\] = `...`

#### transform.rotation?

\[`number`, `number`, `number`\] = `...`

#### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

#### type

`"road"` = `...`

#### vehicle?

\{ `centerOfMass?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisHalfExtents?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `chassisOffset?`: \{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \}; `engineForce?`: `number`; `engineLayers?`: \{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \}; `engineSound?`: `string`; `frictionSlip?`: `number`; `handbrakeForce?`: `number`; `mass?`: `number`; `maxBrake?`: `number`; `maxReverseSpeed?`: `number`; `maxSpeed?`: `number`; `maxSteer?`: `number`; `maxSuspensionTravel?`: `number`; `reverseForce?`: `number`; `rollingResistance?`: `number`; `steerSmooth?`: `number`; `suspensionCompression?`: `number`; `suspensionRelaxation?`: `number`; `suspensionRestLength?`: `number`; `suspensionStiffness?`: `number`; `throttleSmooth?`: `number`; `wheelSpinRate?`: `number`; `yawInertiaScale?`: `number`; \} = `vehicleSchema`

Config do **veículo** (motor/freio/suspensão/centro de massa) — editável no Inspector. Ver ADR-0081.

#### vehicle.centerOfMass?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

Centro de massa: y = altura (BAIXO = estável, não capota), z = frente/trás.

#### vehicle.centerOfMass.x?

`number` = `...`

#### vehicle.centerOfMass.y?

`number` = `...`

#### vehicle.centerOfMass.z?

`number` = `...`

#### vehicle.chassisHalfExtents?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

#### vehicle.chassisHalfExtents.x?

`number` = `...`

#### vehicle.chassisHalfExtents.y?

`number` = `...`

#### vehicle.chassisHalfExtents.z?

`number` = `...`

#### vehicle.chassisOffset?

\{ `x?`: `number`; `y?`: `number`; `z?`: `number`; \} = `...`

Posição da caixa do chassi (collider) relativa à origem.

#### vehicle.chassisOffset.x?

`number` = `...`

#### vehicle.chassisOffset.y?

`number` = `...`

#### vehicle.chassisOffset.z?

`number` = `...`

#### vehicle.engineForce?

`number` = `...`

#### vehicle.engineLayers?

\{ `offHigh?`: `string`; `offLow?`: `string`; `offMid?`: `string`; `offVeryHigh?`: `string`; `onHigh?`: `string`; `onLow?`: `string`; `onMid?`: `string`; \} = `...`

Áudio do motor em CAMADAS (crossfade on/off × faixas de RPM) — som realista.
Cada slot é um caminho de áudio (loop). Tem prioridade sobre `engineSound`.

#### vehicle.engineLayers.offHigh?

`string` = `...`

#### vehicle.engineLayers.offLow?

`string` = `...`

#### vehicle.engineLayers.offMid?

`string` = `...`

#### vehicle.engineLayers.offVeryHigh?

`string` = `...`

#### vehicle.engineLayers.onHigh?

`string` = `...`

#### vehicle.engineLayers.onLow?

`string` = `...`

#### vehicle.engineLayers.onMid?

`string` = `...`

#### vehicle.engineSound?

`string` = `...`

Caminho do áudio do MOTOR (loop único — fallback simples). Ver [EngineSound](../classes/EngineSound.md).

#### vehicle.frictionSlip?

`number` = `...`

#### vehicle.handbrakeForce?

`number` = `...`

#### vehicle.mass?

`number` = `...`

#### vehicle.maxBrake?

`number` = `...`

#### vehicle.maxReverseSpeed?

`number` = `...`

#### vehicle.maxSpeed?

`number` = `...`

Velocidade no fim do velocímetro (km/h).

#### vehicle.maxSteer?

`number` = `...`

#### vehicle.maxSuspensionTravel?

`number` = `...`

#### vehicle.reverseForce?

`number` = `...`

#### vehicle.rollingResistance?

`number` = `...`

#### vehicle.steerSmooth?

`number` = `...`

#### vehicle.suspensionCompression?

`number` = `...`

#### vehicle.suspensionRelaxation?

`number` = `...`

#### vehicle.suspensionRestLength?

`number` = `...`

Altura/curso de repouso da suspensão.

#### vehicle.suspensionStiffness?

`number` = `...`

Sensibilidade da suspensão (rigidez).

#### vehicle.throttleSmooth?

`number` = `...`

#### vehicle.wheelSpinRate?

`number` = `...`

#### vehicle.yawInertiaScale?

`number` = `...`

Escala da inércia de curva (yaw): <1 = vira mais fácil/ágil; 1 = físico.

#### visible?

`boolean` = `...`

`false` = mesh não renderizado (invisível), mas ainda presente na física/raycast.

#### width?

`number` = `...`

Largura total da pista (m). Default [ROAD\_DEFAULT\_WIDTH](../variables/ROAD_DEFAULT_WIDTH.md).

### three

`Object3D`

### terrains?

`TerrainRef`[] = `...`

## Returns

`Promise`\<`void`\>
