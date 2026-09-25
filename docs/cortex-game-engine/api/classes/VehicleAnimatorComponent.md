[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleAnimatorComponent

# Class: VehicleAnimatorComponent

Defined in: src/components/VehicleAnimatorComponent.ts:93

**Animação do piloto por estado de direção** (SPEC-0275). Usa um
`AnimationMixer` próprio (ADR-0274): o [VehicleDriverSystem](VehicleDriverSystem.md) escolhe o
estado a partir de [params](#params) (ou de [forcedState](#forcedstate)), faz o
crossfade por peso e avança o mixer no loop da engine.

Estados sem clipe caem num parecido (`drift_x → steer_x → idle`, o resto
`→ idle`). `victory` toca uma vez e congela no último quadro.

## Example

```ts
const gltf = await loader.loadGLTF('piloto.glb');
const anim = new VehicleAnimatorComponent(gltf.scene, gltf.animations);
entity.addComponent(anim);
// no loop do jogo:
anim.params.throttle = input.isKeyDown('w') ? 1 : 0;
```

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new VehicleAnimatorComponent**(`root`, `clips`, `options?`): `VehicleAnimatorComponent`

Defined in: src/components/VehicleAnimatorComponent.ts:112

#### Parameters

##### root

`Object3D`

Raiz do piloto (a cena do GLB); o mixer anima a hierarquia dela.

##### clips

readonly `AnimationClip`[]

Clipes do GLB (`gltf.animations`).

##### options?

[`VehicleAnimatorOptions`](../interfaces/VehicleAnimatorOptions.md) = `{}`

#### Returns

`VehicleAnimatorComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### actions

> `readonly` **actions**: `Map`\<`"accelerate"` \| `"brake"` \| `"idle"` \| `"steer_left"` \| `"steer_right"` \| `"drift_left"` \| `"drift_right"` \| `"victory"`, `AnimationAction`\>

Defined in: src/components/VehicleAnimatorComponent.ts:96

Actions por estado (só os estados com clipe no asset).

***

### activeClip

> **activeClip**: `string` \| `null` = `null`

Defined in: src/components/VehicleAnimatorComponent.ts:106

Nome do clipe tocando agora (escrito pelo sistema).

***

### crossFade

> **crossFade**: `number`

Defined in: src/components/VehicleAnimatorComponent.ts:100

Duração do crossfade, em segundos (editável ao vivo).

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### forcedState

> **forcedState**: `"accelerate"` \| `"brake"` \| `"idle"` \| `"steer_left"` \| `"steer_right"` \| `"drift_left"` \| `"drift_right"` \| `"victory"` \| `null` = `null`

Defined in: src/components/VehicleAnimatorComponent.ts:102

Força um estado (seleção manual, vitória). `null` = automático.

***

### mixer

> `readonly` **mixer**: `AnimationMixer`

Defined in: src/components/VehicleAnimatorComponent.ts:94

***

### params

> `readonly` **params**: [`VehicleDriveParams`](../interfaces/VehicleDriveParams.md)

Defined in: src/components/VehicleAnimatorComponent.ts:97

***

### state

> **state**: `"accelerate"` \| `"brake"` \| `"idle"` \| `"steer_left"` \| `"steer_right"` \| `"drift_left"` \| `"drift_right"` \| `"victory"` \| `null` = `null`

Defined in: src/components/VehicleAnimatorComponent.ts:104

Estado lógico atual (escrito pelo sistema).

***

### thresholds

> `readonly` **thresholds**: [`VehicleAnimThresholds`](../interfaces/VehicleAnimThresholds.md)

Defined in: src/components/VehicleAnimatorComponent.ts:98

## Accessors

### type

#### Get Signature

> **get** **type**(): `string`

Defined in: [src/ecs/Component.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L16)

Identificador do tipo do componente.
Retorna o nome da classe construtora (ex: "TransformComponent").
Usado por Entity para indexar componentes no Map<string, Component>.

##### Returns

`string`

#### Inherited from

[`Component`](Component.md).[`type`](Component.md#type)
