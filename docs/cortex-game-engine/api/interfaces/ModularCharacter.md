[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ModularCharacter

# Interface: ModularCharacter

Defined in: [src/scene/ModularCharacter.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModularCharacter.ts#L13)

Um personagem **modular** montado: o `object` (pronto pra `scene.add`) com todas as
peças deformando juntas, e o `animator` que toca os clipes do rig. Ver
[composeModularCharacter](../functions/composeModularCharacter.md).

## Properties

### animator

> **animator**: [`SceneAnimator`](../classes/SceneAnimator.md)

Defined in: [src/scene/ModularCharacter.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModularCharacter.ts#L17)

Animador ligado ao esqueleto do rig — toque `idle`/`walk`/… e dê `update(dt)` por frame.

***

### object

> **object**: `Object3D`

Defined in: [src/scene/ModularCharacter.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModularCharacter.ts#L15)

Raiz do personagem (esqueleto do rig + meshes das peças). Adicione à cena.
