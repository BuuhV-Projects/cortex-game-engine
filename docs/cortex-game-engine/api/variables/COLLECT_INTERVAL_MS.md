[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / COLLECT\_INTERVAL\_MS

# Variable: COLLECT\_INTERVAL\_MS

> `const` **COLLECT\_INTERVAL\_MS**: `250` = `250`

Defined in: [src/systems/CharacterPhysicsSystem.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L42)

De quanto em quanto tempo (ms) a cena é varrida de novo pra remontar as listas
(SPEC-0302). Varrer todo quadro custava caro em mapa grande; mover o que já está
nas listas não precisa disso (os raios usam a `matrixWorld` atual).
