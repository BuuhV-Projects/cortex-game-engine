[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ProceduralDriverPoseComponent

# Class: ProceduralDriverPoseComponent

Defined in: src/components/ProceduralDriverPoseComponent.ts:76

**Pose procedural do piloto** (SPEC-0275): rotações aditivas pequenas em
`Spine`, `Chest` e `Head` por cima da animação — corpo inclina na curva, para
trás ao acelerar, para frente ao frear; cabeça olha para a curva. Calculado no
referencial do piloto (glTF: +Z frente, +Y cima — ADR-0274), então independe
dos eixos locais do rig.

Bone ausente é ignorado (fica em [missingBones](#missingbones)). O
[VehicleDriverSystem](VehicleDriverSystem.md) aplica depois do mixer.

## Example

```ts
const params = createDriveParams();
entity
  .addComponent(new VehicleAnimatorComponent(piloto, clips, { params }))
  .addComponent(new ProceduralDriverPoseComponent(piloto, params, { limits: { maxRoll: 0.3 } }));
```

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new ProceduralDriverPoseComponent**(`root`, `params?`, `options?`): `ProceduralDriverPoseComponent`

Defined in: src/components/ProceduralDriverPoseComponent.ts:93

#### Parameters

##### root

`Object3D`

Raiz do piloto (define o referencial frente/cima).

##### params?

[`VehicleDriveParams`](../interfaces/VehicleDriveParams.md) = `...`

Parâmetros de direção (o mesmo objeto do animador).

##### options?

[`DriverPoseOptions`](../interfaces/DriverPoseOptions.md) = `{}`

#### Returns

`ProceduralDriverPoseComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### boneNames

> `readonly` **boneNames**: [`DriverPoseBoneNames`](../interfaces/DriverPoseBoneNames.md)

Defined in: src/components/ProceduralDriverPoseComponent.ts:78

***

### bones

> **bones**: \{ `chest`: [`DriverPoseBoneState`](../interfaces/DriverPoseBoneState.md) \| `null`; `head`: [`DriverPoseBoneState`](../interfaces/DriverPoseBoneState.md) \| `null`; `spine`: [`DriverPoseBoneState`](../interfaces/DriverPoseBoneState.md) \| `null`; \} \| `null` = `null`

Defined in: src/components/ProceduralDriverPoseComponent.ts:84

Bones resolvidos (escrito pelo sistema na 1ª execução).

***

### current

> `readonly` **current**: `object`

Defined in: src/components/ProceduralDriverPoseComponent.ts:82

Ângulos suavizados atuais, em rad (escritos pelo sistema).

#### headRoll

> **headRoll**: `number` = `0`

#### headYaw

> **headYaw**: `number` = `0`

#### pitch

> **pitch**: `number` = `0`

#### roll

> **roll**: `number` = `0`

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### limits

> `readonly` **limits**: [`DriverPoseLimits`](../interfaces/DriverPoseLimits.md)

Defined in: src/components/ProceduralDriverPoseComponent.ts:77

***

### missingBones

> **missingBones**: `string`[] = `[]`

Defined in: src/components/ProceduralDriverPoseComponent.ts:87

Bones da convenção que o piloto não tem.

***

### params

> **params**: [`VehicleDriveParams`](../interfaces/VehicleDriveParams.md)

Defined in: src/components/ProceduralDriverPoseComponent.ts:95

Parâmetros de direção (o mesmo objeto do animador).

***

### root

> **root**: `Object3D`

Defined in: src/components/ProceduralDriverPoseComponent.ts:94

Raiz do piloto (define o referencial frente/cima).

***

### smoothing

> **smoothing**: `number`

Defined in: src/components/ProceduralDriverPoseComponent.ts:80

***

### speedRef

> **speedRef**: `number`

Defined in: src/components/ProceduralDriverPoseComponent.ts:79

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
