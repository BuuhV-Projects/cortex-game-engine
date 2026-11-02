[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setupVehicleDriver

# Function: setupVehicleDriver()

> **setupVehicleDriver**(`world`, `cfg`): [`VehicleDriverHandle`](../interfaces/VehicleDriverHandle.md)

Defined in: [src/scene/VehicleDriver.ts:140](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleDriver.ts#L140)

**Liga um piloto num veículo com uma chamada** (SPEC-0275): valida a
convenção, senta o piloto (lança se o assento faltar, com o relatório), cria a
entidade com assento + animador + pose sobre um `params` compartilhado e
registra o [VehicleDriverSystem](../classes/VehicleDriverSystem.md) se ainda não houver.

## Parameters

### world

[`World`](../classes/World.md)

### cfg

[`VehicleDriverConfig`](../interfaces/VehicleDriverConfig.md)

## Returns

[`VehicleDriverHandle`](../interfaces/VehicleDriverHandle.md)

## Example

```ts
const kart = await loader.loadGLTF('kart.glb');
const piloto = await loader.loadGLTF('piloto.glb');
game.scene.add(kart.scene);
const driver = setupVehicleDriver(game.world, {
  vehicle: kart.scene, driver: piloto.scene, clips: piloto.animations,
  pauseWhen: () => game.editorActive || game.gameplayPaused,
});
game.onUpdate(() => { driver.params.throttle = game.input.isKeyDown('w') ? 1 : 0; });
```
