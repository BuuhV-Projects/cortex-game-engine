[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleRig

# Interface: VehicleRig

Defined in: [src/scene/VehicleSetup.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L16)

Estado compartilhado do carro, exposto em `carObj.userData.cortexCarRig` pra o jogo
orquestrar (invocar/entrar/sair) via script (ADR-0086). A FÍSICA + controle ficam nos
sistemas criados aqui; o rig é só o ponto de encontro (referências + flags).

## Properties

### carObj

> **carObj**: `Object3D`

Defined in: [src/scene/VehicleSetup.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L18)

***

### enterRequested

> **enterRequested**: `boolean`

Defined in: [src/scene/VehicleSetup.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L27)

A interação "Entrar" levanta isto; o script consome.

***

### getEngineSound

> **getEngineSound**: () => [`EngineSound`](../classes/EngineSound.md) \| `null`

Defined in: [src/scene/VehicleSetup.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L25)

#### Returns

[`EngineSound`](../classes/EngineSound.md) \| `null`

***

### player

> **player**: `Object3D`\<`Object3DEventMap`\> \| `null`

Defined in: [src/scene/VehicleSetup.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L20)

Player (pra esconder ao entrar / reposicionar ao sair) — o jogo preenche.

***

### playerT

> **playerT**: \{ `x`: `number`; `y`: `number`; `z`: `number`; \} \| `null`

Defined in: [src/scene/VehicleSetup.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L22)

Transform ECS do player (reposiciona ao sair) — o jogo preenche.

***

### state

> **state**: `object`

Defined in: [src/scene/VehicleSetup.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L24)

`driving`/`spawned` — o MESMO objeto que o jogo usa em pauseWhen/interação.

#### driving

> **driving**: `boolean`

#### spawned

> **spawned**: `boolean`

***

### vehicle

> **vehicle**: [`Vehicle`](../classes/Vehicle.md) \| `null`

Defined in: [src/scene/VehicleSetup.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L17)
