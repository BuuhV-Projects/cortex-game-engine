[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleDriveParams

# Interface: VehicleDriveParams

Defined in: [src/components/VehicleAnimatorComponent.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L24)

Parâmetros contínuos de direção — o jogo (input ou IA) escreve uma vez por
frame; o [VehicleAnimatorComponent](../classes/VehicleAnimatorComponent.md) e o [ProceduralDriverPoseComponent](../classes/ProceduralDriverPoseComponent.md)
leem o MESMO objeto.

## Properties

### brake

> **brake**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L32)

Freio 0..1.

***

### drift

> **drift**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L34)

Drift −1..1: 0 sem drift; o sinal é o lado (−1 esquerda).

***

### speed

> **speed**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L26)

Velocidade de avanço, em m/s (negativa = ré).

***

### steer

> **steer**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L28)

Esterço −1..1: −1 esquerda, +1 direita (convenção do input).

***

### throttle

> **throttle**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L30)

Acelerador 0..1.
