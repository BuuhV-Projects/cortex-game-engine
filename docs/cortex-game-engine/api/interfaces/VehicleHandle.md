[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleHandle

# Interface: VehicleHandle

Defined in: [src/scene/VehicleSetup.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L56)

Handle de [setupVehicle](../functions/setupVehicle.md): o que o jogo usa no loop (velocímetro/som/tune).

## Properties

### engineSound

> **engineSound**: [`EngineSound`](../classes/EngineSound.md) \| `null`

Defined in: [src/scene/VehicleSetup.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L69)

***

### options

> **options**: [`VehicleControlOptions`](VehicleControlOptions.md)

Defined in: [src/scene/VehicleSetup.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L68)

***

### physics

> **physics**: [`RapierPhysics`](../classes/RapierPhysics.md)

Defined in: [src/scene/VehicleSetup.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L65)

O mundo físico em que o carro e os colisores do terreno/estrada foram criados
(SPEC-0300). Use pra pôr outros corpos que colidem com o carro — ex.: um carro
cinemático guiado pelo jogo: `physics.addBody({ type: 'kinematic', … })` e
`setNextKinematicTranslation` a cada quadro. **Não** chame `step()`/`advance()`:
o [VehicleControlSystem](../classes/VehicleControlSystem.md) já avança este mundo uma vez por quadro.

***

### rig

> **rig**: [`VehicleRig`](VehicleRig.md)

Defined in: [src/scene/VehicleSetup.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L66)

***

### speedo

> **speedo**: [`Speedometer`](../classes/Speedometer.md)

Defined in: [src/scene/VehicleSetup.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L67)

***

### vehicle

> **vehicle**: [`Vehicle`](../classes/Vehicle.md)

Defined in: [src/scene/VehicleSetup.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L57)
