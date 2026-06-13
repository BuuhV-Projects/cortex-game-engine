[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Terrain

# Class: Terrain

Defined in: [src/scene/Terrain.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L77)

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

Defined in: [src/scene/Terrain.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L102)

#### Parameters

##### options?

[`TerrainOptions`](../interfaces/TerrainOptions.md) = `{}`

#### Returns

`Terrain`

## Properties

### depth

> `readonly` **depth**: `number`

Defined in: [src/scene/Terrain.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L85)

Profundidade (Z) em unidades de mundo.

***

### mesh

> `readonly` **mesh**: `Mesh`

Defined in: [src/scene/Terrain.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L79)

O mesh do terreno (adicione à cena).

***

### resolution

> `readonly` **resolution**: `number`

Defined in: [src/scene/Terrain.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L81)

Segmentos por lado (grade `(resolution+1)²`).

***

### width

> `readonly` **width**: `number`

Defined in: [src/scene/Terrain.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L83)

Largura (X) em unidades de mundo.

## Methods

### getHeights()

> **getHeights**(): `number`[]

Defined in: [src/scene/Terrain.ts:218](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L218)

Heightmap atual (row-major, `(res+1)²`) — serializável pra persistência.

#### Returns

`number`[]

***

### getLayers()

> **getLayers**(): [`TerrainPaintLayer`](../interfaces/TerrainPaintLayer.md)[]

Defined in: [src/scene/Terrain.ts:236](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L236)

Camadas de textura em uso (cópia; índice = canal RGBA do splatmap).

#### Returns

[`TerrainPaintLayer`](../interfaces/TerrainPaintLayer.md)[]

***

### getPaint()

> **getPaint**(): [`TerrainPaintData`](../interfaces/TerrainPaintData.md) \| `null`

Defined in: [src/scene/Terrain.ts:314](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L314)

Pintura atual (camadas + splatmap em base64) — serializável, ou `null` se nunca pintou.

#### Returns

[`TerrainPaintData`](../interfaces/TerrainPaintData.md) \| `null`

***

### heightAt()

> **heightAt**(`localX`, `localZ`): `number` \| `null`

Defined in: [src/scene/Terrain.ts:199](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L199)

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

Defined in: [src/scene/Terrain.ts:245](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L245)

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

Defined in: [src/scene/Terrain.ts:271](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L271)

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

Defined in: [src/scene/Terrain.ts:164](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L164)

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

Defined in: [src/scene/Terrain.ts:223](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L223)

Substitui o heightmap inteiro (ex.: restaurar autoria salva) e atualiza o mesh.

#### Parameters

##### heights

`number`[]

#### Returns

`void`

***

### setLayerRepeat()

> **setLayerRepeat**(`index`, `repeat`): `void`

Defined in: [src/scene/Terrain.ts:257](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L257)

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

Defined in: [src/scene/Terrain.ts:324](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L324)

Restaura uma pintura salva ([Terrain.getPaint](#getpaint)): camadas + splatmap.

#### Parameters

##### data

[`TerrainPaintData`](../interfaces/TerrainPaintData.md)

#### Returns

`void`
