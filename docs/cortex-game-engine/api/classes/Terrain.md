[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Terrain

# Class: Terrain

Defined in: src/scene/Terrain.ts:40

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

Defined in: src/scene/Terrain.ts:53

#### Parameters

##### options?

[`TerrainOptions`](../interfaces/TerrainOptions.md) = `{}`

#### Returns

`Terrain`

## Properties

### depth

> `readonly` **depth**: `number`

Defined in: src/scene/Terrain.ts:48

Profundidade (Z) em unidades de mundo.

***

### mesh

> `readonly` **mesh**: `Mesh`

Defined in: src/scene/Terrain.ts:42

O mesh do terreno (adicione à cena).

***

### resolution

> `readonly` **resolution**: `number`

Defined in: src/scene/Terrain.ts:44

Segmentos por lado (grade `(resolution+1)²`).

***

### width

> `readonly` **width**: `number`

Defined in: src/scene/Terrain.ts:46

Largura (X) em unidades de mundo.

## Methods

### getHeights()

> **getHeights**(): `number`[]

Defined in: src/scene/Terrain.ts:145

Heightmap atual (row-major, `(res+1)²`) — serializável pra persistência.

#### Returns

`number`[]

***

### sculpt()

> **sculpt**(`localX`, `localZ`, `radius`, `delta`): `boolean`

Defined in: src/scene/Terrain.ts:115

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

Defined in: src/scene/Terrain.ts:150

Substitui o heightmap inteiro (ex.: restaurar autoria salva) e atualiza o mesh.

#### Parameters

##### heights

`number`[]

#### Returns

`void`
