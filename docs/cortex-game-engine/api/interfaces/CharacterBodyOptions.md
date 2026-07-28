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

### footOffset?

> `optional` **footOffset?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L33)

**Offset dos pés** — distância da ORIGEM do mesh até a sua BASE (pés). Modelos com
origem nos pés = `0`; primitivas (cilindro/box/esfera) têm origem no **centro**, então
`footOffset = altura/2`. A física ancora os **pés** (`transform.y − footOffset`) no
chão; sem isso o mesh **afunda** metade da altura. O [buildScene](../functions/buildScene.md) calcula do
bounds do mesh. Default `0`.

***

### gravity?

> `optional` **gravity?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L10)

Gravidade (unidades/s²) que puxa o personagem pra baixo. Default `30`.

***

### groundY?

> `optional` **groundY?**: `number`

Defined in: [src/components/CharacterBodyComponent.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/CharacterBodyComponent.ts#L25)

**Altura do chão (Y)** — piso plano de **fallback** onde o personagem aterra se
NÃO houver geometria embaixo (rede de segurança contra cair no vazio). O chão
principal vem da **colisão real** (raycast na cena) do [CharacterPhysicsSystem](../classes/CharacterPhysicsSystem.md).
Default `-Infinity` = sem rede. O editor/data-driven usam `0` por padrão.

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
