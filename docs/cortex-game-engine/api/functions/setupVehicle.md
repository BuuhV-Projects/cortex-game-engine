[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setupVehicle

# Function: setupVehicle()

> **setupVehicle**(`game`, `carObj`, `state`, `cfg`): `Promise`\<[`VehicleHandle`](../interfaces/VehicleHandle.md)\>

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/VehicleSetup.ts:74](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L74)

**Liga um carro raycast (Rapier — ADR-0081) num [Game](../classes/Game.md) com uma chamada** (estilo
`setupThirdPerson`). Cria a física + colliders do terreno/road, o veículo, o
[VehicleControlSystem](../classes/VehicleControlSystem.md), marcas de pneu, som de motor em camadas e o velocímetro;
esconde o carro (nasce invocado pelo jogo) e expõe o [VehicleRig](../interfaces/VehicleRig.md) em
`carObj.userData.cortexCarRig`. Devolve o handle pro loop do jogo (velocímetro/som/tune).

O `state` é passado de fora (o MESMO objeto que o jogo usa em `pauseWhen`/interação), pra o
`driving`/`spawned` valerem em todos os lugares. Infra reutilizável — sem cola no `main.ts`.

## Parameters

### game

[`Game`](../classes/Game.md)

### carObj

`Object3D`

### state

#### driving

`boolean`

#### spawned

`boolean`

### cfg

[`VehicleSetupConfig`](../interfaces/VehicleSetupConfig.md)

## Returns

`Promise`\<[`VehicleHandle`](../interfaces/VehicleHandle.md)\>
