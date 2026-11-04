[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehiclePoseOwner

# Type Alias: VehiclePoseOwner

> **VehiclePoseOwner** = `"physics"` \| `"external"`

Defined in: [src/components/ArcadeVehicleComponent.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/ArcadeVehicleComponent.ts#L12)

Quem escreve a pose da malha do carro (SPEC-0687).

- `'physics'`: o [VehicleArcadeSystem](../classes/VehicleArcadeSystem.md) roda aderência e controlador e copia a pose do corpo para a malha.
- `'external'`: o sistema não toca o carro (nem lê o corpo); quem marcou escreve a malha, como o trânsito no
  trilho, que já sabe a pose que deu ao corpo cinemático.
