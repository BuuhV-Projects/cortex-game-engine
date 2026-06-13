[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Terrain

# Class: Terrain

Defined in: [src/scene/Terrain.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L72)

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

Defined in: [src/scene/Terrain.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L101)

#### Parameters

##### options?

[`TerrainOptions`](../interfaces/TerrainOptions.md) = `{}`

#### Returns

`Terrain`

## Properties

### depth

> `readonly` **depth**: `number`

Defined in: [src/scene/Terrain.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L80)

Profundidade (Z) em unidades de mundo.

***

### mesh

> `readonly` **mesh**: `Mesh`

Defined in: [src/scene/Terrain.ts:74](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L74)

O mesh do terreno (adicione à cena).

***

### resolution

> `readonly` **resolution**: `number`

Defined in: [src/scene/Terrain.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L76)

Segmentos por lado (grade `(resolution+1)²`).

***

### width

> `readonly` **width**: `number`

Defined in: [src/scene/Terrain.ts:78](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L78)

Largura (X) em unidades de mundo.

## Methods

### getHeights()

> **getHeights**(): `number`[]

Defined in: [src/scene/Terrain.ts:217](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L217)

Heightmap atual (row-major, `(res+1)²`) — serializável pra persistência.

#### Returns

`number`[]

***

### getLayers()

> **getLayers**(): [`TerrainPaintLayer`](../interfaces/TerrainPaintLayer.md)[]

Defined in: [src/scene/Terrain.ts:235](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L235)

Camadas de textura em uso (cópia; índice = canal RGBA do splatmap).

#### Returns

[`TerrainPaintLayer`](../interfaces/TerrainPaintLayer.md)[]

***

### getPaint()

> **getPaint**(): [`TerrainPaintData`](../interfaces/TerrainPaintData.md) \| `null`

Defined in: [src/scene/Terrain.ts:313](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L313)

Pintura atual (camadas + splatmap em base64) — serializável, ou `null` se nunca pintou.

#### Returns

[`TerrainPaintData`](../interfaces/TerrainPaintData.md) \| `null`

***

### heightAt()

> **heightAt**(`localX`, `localZ`): `number` \| `null`

Defined in: [src/scene/Terrain.ts:198](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L198)

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

### layerFor()

> **layerFor**(`url`, `repeat?`): `number`

Defined in: [src/scene/Terrain.ts:244](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L244)

Índice da camada da textura `url` — reusa se já existe, senão **aloca** a
próxima livre (carrega a textura e liga o shader de splat). Retorna `-1` se as
[TERRAIN\_MAX\_LAYERS](../variables/TERRAIN_MAX_LAYERS.md) camadas já estão ocupadas por outras texturas.

#### Parameters

##### url

`string`

##### repeat?

`number`

#### Returns

`number`

***

### paint()

> **paint**(`localX`, `localZ`, `radius`, `amount`, `layer`): `boolean`

Defined in: [src/scene/Terrain.ts:270](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L270)

**Pinta** textura no terreno: soma `amount` (0..1 por pincelada; negativo
apaga) ao peso da camada `layer` num círculo de `radius` (coords LOCAIS, como
[Terrain.sculpt](#sculpt)), com o mesmo falloff smoothstep. Pesos das outras
camadas são reduzidos quando a soma estoura (a base aparece onde nada foi
pintado). Retorna `true` se algum texel mudou.

#### Parameters

##### localX

`number`

##### localZ

`number`

##### radius

`number`

##### amount

`number`

##### layer

`number`

#### Returns

`boolean`

***

### sculpt()

> **sculpt**(`localX`, `localZ`, `radius`, `delta`): `boolean`

Defined in: [src/scene/Terrain.ts:163](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L163)

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

Defined in: [src/scene/Terrain.ts:222](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L222)

Substitui o heightmap inteiro (ex.: restaurar autoria salva) e atualiza o mesh.

#### Parameters

##### heights

`number`[]

#### Returns

`void`

***

### setLayerRepeat()

> **setLayerRepeat**(`index`, `repeat`): `void`

Defined in: [src/scene/Terrain.ts:256](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L256)

Ajusta o tiling (repetições ao longo do terreno) de uma camada.

#### Parameters

##### index

`number`

##### repeat

`number`

#### Returns

`void`

***

### setPaint()

> **setPaint**(`data`): `void`

Defined in: [src/scene/Terrain.ts:323](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L323)

Restaura uma pintura salva ([Terrain.getPaint](#getpaint)): camadas + splatmap.

#### Parameters

##### data

[`TerrainPaintData`](../interfaces/TerrainPaintData.md)

#### Returns

`void`
