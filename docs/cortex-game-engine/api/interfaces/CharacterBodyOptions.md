[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CharacterBodyOptions

# Interface: CharacterBodyOptions

Defined in: [src/components/CharacterBodyComponent.ts:4](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L4)

Opções do [CharacterBodyComponent](../classes/CharacterBodyComponent.md) (estilo UPBGE "Character").

## Properties

### fallSpeedMax?

> `optional` **fallSpeedMax?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L16)

**Fall Speed Max** — velocidade máxima de queda. Default `25`.

***

### gravity?

> `optional` **gravity?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L10)

Gravidade (unidades/s²) que puxa o personagem pra baixo. Default `30`.

***

### groundY?

> `optional` **groundY?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L26)

**Altura do chão (Y)** — piso plano onde o personagem aterra (pés nessa altura).
Estável e **sem raycast** (não treme): a gravidade puxa e para aqui; o pulo
volta pra cá. Default `-Infinity` = sem piso (cai livre — quem aterra é o
terreno/colisão). Em jogos de chão plano (top-down), use a altura do chão
(ex.: `0`). O editor preenche com a altura onde o objeto foi posicionado.

***

### height?

> `optional` **height?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L8)

Altura total da cápsula (pés→topo). Default `1.8`.

***

### jumpForce?

> `optional` **jumpForce?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L14)

**Jump Force** — velocidade vertical aplicada ao pular. Default `9`.

***

### maxJumps?

> `optional` **maxJumps?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L18)

**Max Jumps** — nº máximo de pulos antes de tocar o chão (1 = sem double-jump). Default `1`.

***

### radius?

> `optional` **radius?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:6](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L6)

Raio da cápsula de colisão. Default `0.4`.

***

### stepHeight?

> `optional` **stepHeight?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L12)

**Step Height** — altura máxima de degrau que o personagem sobe andando. Default `0.4`.
