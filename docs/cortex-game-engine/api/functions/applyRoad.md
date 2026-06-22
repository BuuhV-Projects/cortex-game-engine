[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / applyRoad

# Function: applyRoad()

> **applyRoad**(`mesh`, `node`, `three`): `void`

Defined in: [src/scene/SceneBuilder.ts:1041](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L1041)

(Re)gera a malha + material de uma estrada num `mesh` existente (ADR-0072).
Amostra a spline dos `nodes`, **conforma ao terreno** (raycast pra baixo por amostra
→ `terrenoY + yOffset`), monta o ribbon e aplica a superfície. Quando há textura, a
cor base vira **branca** (senão o `color` escuro escureceria a textura). Atualiza
`userData.cortexRoad`. Exportado pra o editor regenerar ao vivo (trocar superfície/
largura). `three` = raiz da cena (pra achar o terreno).

## Parameters

### mesh

`Mesh`

### node

#### collider?

\{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \} = `colliderSchema`

#### collider.height?

`number` = `...`

#### collider.offsetX?

`number` = `...`

#### collider.offsetY?

`number` = `...`

#### collider.oneWay?

`boolean` = `...`

#### collider.points?

\[`number`, `number`\][] = `...`

Perfil do chão (LOCAL, ordenado por X) quando `shape` é `heightfield`.

#### collider.shape?

`"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"` = `...`

#### collider.solid?

`boolean` = `...`

#### collider.width?

`number` = `...`

#### conformTerrain?

`boolean` = `...`

A pista acompanha a altura do terreno (raycast por amostra). Default true.

#### id

`string` = `...`

#### nodes

\[`number`, `number`, `number`\][] = `...`

Pontos de controle da spline (≥2), em metros.

#### steps?

`number` = `...`

Densidade da tessellation: amostras por 90° de curvatura (adaptativa). Default 16.

#### surface?

`"asphalt"` \| `"concrete"` \| `"dirt"` \| `"brick"` \| `"cobblestone"` \| \{ `color?`: `string` \| `number`; `diffuse?`: `string`; `normal?`: `string`; `repeat?`: `number`; \} = `...`

Superfície: nome embutido (`asphalt`/…) ou URLs explícitas (diffuse/normal/repeat).

#### transform?

\{ `position?`: \[`number`, `number`, `number`\]; `rotation?`: \[`number`, `number`, `number`\]; `scale?`: `number` \| \[`number`, `number`, `number`\]; \} = `transformSchema`

#### transform.position?

\[`number`, `number`, `number`\] = `...`

#### transform.rotation?

\[`number`, `number`, `number`\] = `...`

#### transform.scale?

`number` \| \[`number`, `number`, `number`\] = `...`

#### type

`"road"` = `...`

#### width?

`number` = `...`

Largura da pista (m). Default 8 (≈2 faixas).

#### yOffset?

`number` = `...`

Levanta a pista acima do chão (evita z-fight). Default 0.05 m.

### three

`Object3D`

## Returns

`void`
