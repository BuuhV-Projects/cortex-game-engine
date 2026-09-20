[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ColliderComponent

# Class: ColliderComponent

Defined in: [src/core/Physics.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L96)

Componente que define o volume de colisão da entidade.

Suporta múltiplas formas via `shape` (SPEC-0027): box, sphere, cylinder,
capsule. O centro do collider é `RigidBodyComponent.position + shape.offset`.
Padrão: cubo 1×1×1 sem offset.

Pra escolher um shape:
```ts
const col = new ColliderComponent()
col.shape = { kind: 'sphere', radius: 0.5 }
// ou
col.shape = { kind: 'cylinder', radius: 0.4, height: 1.8 }
// ou
col.shape = { kind: 'capsule', radius: 0.25, height: 1.2 }  // h = altura do cilindro central
```

**Backwards-compat:** o acesso direto a `col.size` e `col.offset` continua
funcionando como antes:
 - `col.size = {x,y,z}` substitui o `shape` por um box com essas dimensões.
 - `col.size` (getter) retorna o **bounding box equivalente** ao shape atual
   (size literal pra box, `{2r,2r,2r}` pra sphere, `{2r,h,2r}` pra cylinder,
   `{2r, h+2r, 2r}` pra capsule). Útil pra broadphase e debug.
 - `col.offset = v` muta `shape.offset`; `col.offset` retorna `shape.offset ?? {0,0,0}`.

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new ColliderComponent**(): `ColliderComponent`

#### Returns

`ColliderComponent`

#### Inherited from

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### shape

> **shape**: [`ColliderShape`](../type-aliases/ColliderShape.md)

Defined in: [src/core/Physics.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L98)

Forma do collider — ver [ColliderShape](../type-aliases/ColliderShape.md). Default: cubo 1×1×1.

## Accessors

### offset

#### Get Signature

> **get** **offset**(): `Vec3`

Defined in: [src/core/Physics.ts:129](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L129)

Deslocamento do centro do collider em relação a `RigidBodyComponent.position`.
Útil quando a geometria visual não está centrada na origem do corpo.

##### Returns

`Vec3`

#### Set Signature

> **set** **offset**(`value`): `void`

Defined in: [src/core/Physics.ts:132](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L132)

##### Parameters

###### value

`Vec3`

##### Returns

`void`

***

### size

#### Get Signature

> **get** **size**(): `Vec3`

Defined in: [src/core/Physics.ts:108](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L108)

Dimensões totais do bounding box (largura × altura × profundidade).

Getter deriva do `shape` atual; setter substitui `shape` por um box.
Mantido pra compatibilidade com código pré-SPEC-0027.

##### Returns

`Vec3`

#### Set Signature

> **set** **size**(`value`): `void`

Defined in: [src/core/Physics.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L117)

##### Parameters

###### value

`Vec3`

##### Returns

`void`

***

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
