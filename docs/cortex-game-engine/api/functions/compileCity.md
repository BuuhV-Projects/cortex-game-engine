[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / compileCity

# Function: compileCity()

> **compileCity**(`region`): [`CompiledCity`](../interfaces/CompiledCity.md)

Defined in: src/road/compileCity.ts:32

**Compila uma [RegionSpec](../type-aliases/RegionSpec.md) em nós de cena** (ADR-0087): cada via (rodovias + ruas das
cidades) vira um nó `road` com `profile` (renderizado pelo `buildScene`/`makeProfiledRoad`,
conformando ao terreno) + o [NavGraph](../interfaces/NavGraph.md) dos carros. Pontos `[x,z]` viram `[x,0,z]` (a
altura vem do conform). Cruzamentos/quadras (ProBuilder)/landmarks são camadas à parte
(fase seguinte) — aqui entregamos a malha viária renderável + a navegação.

## Parameters

### region

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

[`CompiledCity`](../interfaces/CompiledCity.md)

## Example

```ts
const { roads, nav } = compileCity(ceilandia)
await buildScene(game.scene, [{ nodes: roads } as any], { world: game.world })
```
