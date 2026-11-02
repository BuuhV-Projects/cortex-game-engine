[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Terrain

# Class: Terrain

Defined in: [src/scene/Terrain.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L75)

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

Defined in: [src/scene/Terrain.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L106)

#### Parameters

##### options?

[`TerrainOptions`](../interfaces/TerrainOptions.md) = `{}`

#### Returns

`Terrain`

## Properties

### depth

> `readonly` **depth**: `number`

Defined in: [src/scene/Terrain.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L83)

Profundidade (Z) em unidades de mundo.

***

### mesh

> `readonly` **mesh**: `Mesh`

Defined in: [src/scene/Terrain.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L77)

O mesh do terreno (adicione à cena).

***

### resolution

> `readonly` **resolution**: `number`

Defined in: [src/scene/Terrain.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L79)

Segmentos por lado (grade `(resolution+1)²`).

***

### width

> `readonly` **width**: `number`

Defined in: [src/scene/Terrain.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L81)

Largura (X) em unidades de mundo.

## Methods

### baseHeightAt()

> **baseHeightAt**(`localX`, `localZ`): `number` \| `null`

Defined in: [src/scene/Terrain.ts:193](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L193)

Altura (Y local) da **base** autorada num ponto, sem o corte das estradas — o greide
das estradas parte daqui (não realimenta o próprio corte). `null` fora da área.

#### Parameters

##### localX

`number`

##### localZ

`number`

#### Returns

`number` \| `null`

***

### getHeights()

> **getHeights**(): `number`[]

Defined in: [src/scene/Terrain.ts:263](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L263)

Heightmap atual (row-major, `(res+1)²`) — serializável pra persistência.

#### Returns

`number`[]

***

### getLayers()

> **getLayers**(): [`TerrainPaintLayer`](../interfaces/TerrainPaintLayer.md)[]

Defined in: [src/scene/Terrain.ts:278](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L278)

Camadas de textura em uso (cópia; índice = canal RGBA do splatmap).

#### Returns

[`TerrainPaintLayer`](../interfaces/TerrainPaintLayer.md)[]

***

### getPaint()

> **getPaint**(): [`TerrainPaintData`](../interfaces/TerrainPaintData.md) \| `null`

Defined in: [src/scene/Terrain.ts:356](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L356)

Pintura atual (camadas + splatmap em base64) — serializável, ou `null` se nunca pintou.

#### Returns

[`TerrainPaintData`](../interfaces/TerrainPaintData.md) \| `null`

***

### heightAt()

> **heightAt**(`localX`, `localZ`): `number` \| `null`

Defined in: [src/scene/Terrain.ts:239](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L239)

Altura (Y **local**) do terreno num ponto `(localX, localZ)` por **interpolação
bilinear** do heightmap — pra colisão/ground (o player fica em cima). Inclui o
delta de moldagem da estrada (o player anda sobre o terreno moldado). Retorna
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

Defined in: [src/scene/Terrain.ts:287](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L287)

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

Defined in: [src/scene/Terrain.ts:313](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L313)

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

Defined in: [src/scene/Terrain.ts:203](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L203)

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

Defined in: [src/scene/Terrain.ts:269](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L269)

Substitui o heightmap **base** inteiro (ex.: restaurar autoria salva) e atualiza
o mesh (mantendo o delta de moldagem da estrada por cima, se houver).

#### Parameters

##### heights

`number`[]

#### Returns

`void`

***

### setLayerRepeat()

> **setLayerRepeat**(`index`, `repeat`): `void`

Defined in: [src/scene/Terrain.ts:299](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L299)

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

Defined in: [src/scene/Terrain.ts:366](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L366)

Restaura uma pintura salva ([Terrain.getPaint](#getpaint)): camadas + splatmap.

#### Parameters

##### data

[`TerrainPaintData`](../interfaces/TerrainPaintData.md)

#### Returns

`void`

***

### setRoadMolding()

> **setRoadMolding**(`delta`): `void`

Defined in: [src/scene/Terrain.ts:182](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L182)

**Molda o terreno às estradas** (SPEC-0631 §3): aplica `delta` (mesmo tamanho do
heightmap) por cima da base; `null` remove. A base e a serialização não mudam. O
[buildScene](../functions/buildScene.md) e o editor chamam isto via `moldTerrainToRoads`.

#### Parameters

##### delta

`Float32Array`\<`ArrayBufferLike`\> \| `null`

#### Returns

`void`
