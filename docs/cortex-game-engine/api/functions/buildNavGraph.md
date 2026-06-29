[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / buildNavGraph

# Function: buildNavGraph()

> **buildNavGraph**(`spec`): [`NavGraph`](../interfaces/NavGraph.md)

Defined in: src/road/navGraph.ts:49

**Constrói o grafo de navegação dos carros** a partir da [RegionSpec](../type-aliases/RegionSpec.md) (ADR-0087). Nós =
cruzamentos declarados + pontas de via (snap por proximidade `SNAP`). Arestas = um trecho por
via (com faixas/oneway/largura/velocidade do perfil). Vias não-dirigíveis
(`pedestrian_market`) são ignoradas (entram na nav de pedestre, à parte).

## Parameters

### spec

#### cities

`object`[] = `...`

#### highways

`object`[] = `...`

#### interchanges

`object`[] = `...`

#### name

`string` = `...`

#### size

\{ `x`: `number`; `z`: `number`; \} = `...`

#### size.x

`number` = `...`

#### size.z

`number` = `...`

#### underlay?

`string` = `...`

## Returns

[`NavGraph`](../interfaces/NavGraph.md)
