[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / applyRoad

# Function: applyRoad()

> **applyRoad**(`mesh`, `node`, `three`): `void`

Defined in: [src/scene/SceneBuilder.ts:1047](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L1047)

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

#### markings?

`"dashed"` \| `"single-yellow"` \| `"double-yellow"` \| `"passing"` \| `"lane"` \| \{ `repeat?`: `number`; `url`: `string`; \} = `...`

Marcação de pista (overlay, ADR-0076): nome embutido (`dashed`/`single-yellow`/
`double-yellow`/`passing`/`lane`) ou `{ url, repeat }`. Ausente = sem marcação.

#### maxSlope?

`number` = `...`

Inclinação máx. do greide (Δalt/Δhoriz). Só `cutfill`. Default 0.25 (25% — a
estrada sobe o morro fazendo ladeira; baixe pra pista mais plana que aplaina mais).

#### nodes

\[`number`, `number`, `number`\][] = `...`

Pontos de controle da spline (≥2), em metros.

#### steps?

`number` = `...`

Densidade da tessellation: amostras por 90° de curvatura (adaptativa). Default 16.

#### surface?

`"asphalt"` \| `"concrete"` \| `"dirt"` \| `"brick"` \| `"cobblestone"` \| \{ `color?`: `string` \| `number`; `diffuse?`: `string`; `normal?`: `string`; `repeat?`: `number`; \} = `...`

Superfície: nome embutido (`asphalt`/…) ou URLs explícitas (diffuse/normal/repeat).

#### taludeWidth?

`number` = `...`

Largura do talude (transição terreno↔pista) em cada lado, m. Só `cutfill`. Default 6.

#### terrainMode?

`"conform"` \| `"cutfill"` = `...`

Como a pista se relaciona com o terreno (ADR-0072 Fase 2):
- `'conform'` (default): a **pista** se deforma acompanhando o relevo (Fase 1).
- `'cutfill'`: o **terreno** se adapta à pista — greide suavizado + *cut & fill*
  (corta morro acima, aterra vale abaixo) com talude nas laterais. Não-destrutivo.

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
