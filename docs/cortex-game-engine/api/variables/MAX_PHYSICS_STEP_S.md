[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / MAX\_PHYSICS\_STEP\_S

# Variable: MAX\_PHYSICS\_STEP\_S

> `const` **MAX\_PHYSICS\_STEP\_S**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/physics/RapierPhysics.ts:187](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L187)

Maior passo de [RapierPhysics.advance](../classes/RapierPhysics.md#advance) (s). Acima disso a suspensão
raycast perde estabilidade; é também o timestep padrão do Rapier, então a
60 fps nada muda.
