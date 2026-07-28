[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / resolveWallPush

# Function: resolveWallPush()

> **resolveWallPush**(`near`, `radius`): `object`

Defined in: [src/systems/CharacterPhysicsSystem.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L95)

Empurrão horizontal pra **sair de paredes**: dado o hit mais próximo em cada
direção de eixo (`±X`/`±Z`, distância ou `null` se livre) e o raio da cápsula,
devolve o deslocamento (dx,dz) que tira o personagem de dentro da parede. Puro
(testável) — o [CharacterPhysicsSystem](../classes/CharacterPhysicsSystem.md) faz os raycasts e aplica.

## Parameters

### near

#### nx

`number` \| `null`

#### nz

`number` \| `null`

#### px

`number` \| `null`

#### pz

`number` \| `null`

### radius

`number`

## Returns

`object`

### dx

> **dx**: `number`

### dz

> **dz**: `number`
