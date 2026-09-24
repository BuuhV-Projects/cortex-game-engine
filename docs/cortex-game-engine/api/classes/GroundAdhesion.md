[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GroundAdhesion

# Class: GroundAdhesion

Defined in: src/physics/GroundAdhesion.ts:76

Mantém um [Vehicle](Vehicle.md) colado no chão, com feel arcade.

Chame [GroundAdhesion.apply](#apply) a cada passo de física, ANTES do
`vehicle.update` — o `VehicleArcadeSystem` já faz isso.

## Example

```ts
const adhesion = new GroundAdhesion(physics, vehicle, { minNormalY: 0.6 });
adhesion.apply(1 / 60);
if (!adhesion.grounded) playAirborneAnimation();
```

## Constructors

### Constructor

> **new GroundAdhesion**(`physics`, `vehicle`, `options?`): `GroundAdhesion`

Defined in: src/physics/GroundAdhesion.ts:100

#### Parameters

##### physics

[`RapierPhysics`](RapierPhysics.md)

##### vehicle

[`Vehicle`](Vehicle.md)

##### options?

[`GroundAdhesionOptions`](../interfaces/GroundAdhesionOptions.md) = `{}`

#### Returns

`GroundAdhesion`

## Properties

### grounded

> **grounded**: `boolean` = `false`

Defined in: src/physics/GroundAdhesion.ts:78

O carro terminou o último passo apoiado no chão?

***

### groundNormal

> `readonly` **groundNormal**: `Vector3`

Defined in: src/physics/GroundAdhesion.ts:80

Normal do plano de apoio no último passo apoiado.

## Methods

### apply()

> **apply**(`dt`): `boolean`

Defined in: src/physics/GroundAdhesion.ts:116

Um passo de aderência. Devolve [GroundAdhesion.grounded](#grounded).

#### Parameters

##### dt

`number`

passo de física (s) — usado para cancelar a gravidade ao longo
  da pista. `0` só reposiciona, sem mexer na velocidade por gravidade.

#### Returns

`boolean`
