[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / MAX\_PHYSICS\_STEPS

# Variable: MAX\_PHYSICS\_STEPS

> `const` **MAX\_PHYSICS\_STEPS**: `3` = `3`

Defined in: [src/physics/RapierPhysics.ts:195](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L195)

Teto padrão de passos por quadro de [RapierPhysics.advance](../classes/RapierPhysics.md#advance) (ADR-0672). Acima de 3 × 1/60 s (50 ms) o
excedente é descartado: a física desacelera em vez de gastar mais passos num quadro lento.
