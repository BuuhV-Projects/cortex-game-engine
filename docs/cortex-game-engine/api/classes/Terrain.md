[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Terrain

# Class: Terrain

Defined in: [src/scene/Terrain.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L40)

**Terreno** estilo Unity: um plano horizontal (no chão, XZ) subdividido numa
grade, com um **heightmap** que você **esculpe** ([Terrain.sculpt](#sculpt)) —
levanta/abaixa a altura (Y) dos vértices com um pincel de falloff suave. Pensado
pra jogos top-down/3D (combine com a câmera top-down). O heightmap é serializável
([Terrain.getHeights](#getheights)) — o editor persiste e o [buildScene](../functions/buildScene.md) restaura.

O mesh fica em `terrain.mesh` (centrado na origem local; posicione o objeto). O
controlador é guardado em `mesh.userData.cortexTerrain` pra o editor esculpir.

## Example

```ts
const terrain = new Terrain({ size: 60, resolution: 96 })
scene.add(terrain.mesh)
terrain.sculpt(0, 0, 8, 2) // levanta um morro de raio 8 no centro
```

## Constructors

### Constructor

> **new Terrain**(`options?`): `Terrain`

Defined in: [src/scene/Terrain.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L53)

#### Parameters

##### options?

[`TerrainOptions`](../interfaces/TerrainOptions.md) = `{}`

#### Returns

`Terrain`

## Properties

### depth

> `readonly` **depth**: `number`

Defined in: [src/scene/Terrain.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L48)

Profundidade (Z) em unidades de mundo.

***

### mesh

> `readonly` **mesh**: `Mesh`

Defined in: [src/scene/Terrain.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L42)

O mesh do terreno (adicione à cena).

***

### resolution

> `readonly` **resolution**: `number`

Defined in: [src/scene/Terrain.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L44)

Segmentos por lado (grade `(resolution+1)²`).

***

### width

> `readonly` **width**: `number`

Defined in: [src/scene/Terrain.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L46)

Largura (X) em unidades de mundo.

## Methods

### getHeights()

> **getHeights**(): `number`[]

Defined in: [src/scene/Terrain.ts:169](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L169)

Heightmap atual (row-major, `(res+1)²`) — serializável pra persistência.

#### Returns

`number`[]

***

### heightAt()

> **heightAt**(`localX`, `localZ`): `number` \| `null`

Defined in: [src/scene/Terrain.ts:150](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L150)

Altura (Y **local**) do terreno num ponto `(localX, localZ)` por **interpolação
bilinear** do heightmap — pra colisão/ground (o player fica em cima). Retorna
`null` se o ponto está **fora** da área do terreno. Coords locais (centradas);
use `mesh.worldToLocal` antes pra partir de um ponto de mundo.

#### Parameters

##### localX

`number`

##### localZ

`number`

#### Returns

`number` \| `null`

***

### sculpt()

> **sculpt**(`localX`, `localZ`, `radius`, `delta`): `boolean`

Defined in: [src/scene/Terrain.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L115)

**Esculpe** o terreno: soma `delta` à altura num círculo de `radius` (em
coordenadas LOCAIS do terreno, no plano XZ centrado), com **falloff suave**
(cheio no centro → 0 na borda). `delta > 0` levanta, `< 0` abaixa. Recalcula
normais (iluminação acompanha). Retorna `true` se algum vértice mudou.

#### Parameters

##### localX

`number`

##### localZ

`number`

##### radius

`number`

##### delta

`number`

#### Returns

`boolean`

***

### setHeights()

> **setHeights**(`heights`): `void`

Defined in: [src/scene/Terrain.ts:174](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L174)

Substitui o heightmap inteiro (ex.: restaurar autoria salva) e atualiza o mesh.

#### Parameters

##### heights

`number`[]

#### Returns

`void`
