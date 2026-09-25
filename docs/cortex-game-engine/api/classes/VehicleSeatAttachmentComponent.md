[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleSeatAttachmentComponent

# Class: VehicleSeatAttachmentComponent

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L32)

**Senta um personagem no assento de um veículo** (SPEC-0275). O
[VehicleDriverSystem](VehicleDriverSystem.md) acha o anchor `seatName` dentro de `vehicle`,
parenteia o `driver` nele e aplica [offset](#offset)/[rotation](#rotation)/[scale](#scale)
todo frame (editar tem efeito ao vivo).

Anchor ausente: [error](#error) recebe a mensagem (com os nomes que existem no
veículo) e o piloto não é mexido. Para falhar já no carregamento, use
`attachToSeat` ou `setupVehicleDriver`, que lançam.

## Example

```ts
entity.addComponent(new VehicleSeatAttachmentComponent(kart, 'assento', piloto, {
  offset: { x: 0, y: 0.05, z: -0.1 },
}));
```

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new VehicleSeatAttachmentComponent**(`vehicle`, `seatName`, `driver`, `options?`): `VehicleSeatAttachmentComponent`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L41)

#### Parameters

##### vehicle

`Object3D`

##### seatName

`string`

##### driver

`Object3D`

##### options?

[`VehicleSeatOptions`](../interfaces/VehicleSeatOptions.md) = `{}`

#### Returns

`VehicleSeatAttachmentComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### driver

> **driver**: `Object3D`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L44)

***

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### error

> **error**: `string` \| `null` = `null`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L39)

Erro de resolução (anchor ausente), ou `null`.

***

### offset

> `readonly` **offset**: `Vector3`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L33)

***

### rotation

> `readonly` **rotation**: `Euler`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L34)

***

### scale

> `readonly` **scale**: `Vector3`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L35)

***

### seat

> **seat**: `Object3D`\<`Object3DEventMap`\> \| `null` = `null`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L37)

Anchor resolvido (escrito pelo sistema).

***

### seatName

> **seatName**: `string`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L43)

***

### vehicle

> **vehicle**: `Object3D`

Defined in: [src/components/VehicleSeatAttachmentComponent.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleSeatAttachmentComponent.ts#L42)

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
