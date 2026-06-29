[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / validateRegion

# Function: validateRegion()

> **validateRegion**(`input`): `object`

Defined in: [src/road/citySpec.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/citySpec.ts#L81)

Valida uma [RegionSpec](../type-aliases/RegionSpec.md): schema (zod) + **rede** (cruzamento referenciando via
inexistente, via com pontos colineares degenerados, ids duplicados). Retorna `{ ok, issues }`
— `ok` é `false` se houver algum `error`. Use antes de `compile` (a IA pode gerar specs).

## Parameters

### input

`unknown`

## Returns

`object`

### issues

> **issues**: [`SpecIssue`](../interfaces/SpecIssue.md)[]

### ok

> **ok**: `boolean`

### spec?

> `optional` **spec?**: `object`

#### spec.cities

> **cities**: `object`[]

#### spec.highways

> **highways**: `object`[]

#### spec.interchanges

> **interchanges**: `object`[]

#### spec.name

> **name**: `string`

#### spec.size

> **size**: `object`

#### spec.size.x

> **x**: `number`

#### spec.size.z

> **z**: `number`

#### spec.underlay?

> `optional` **underlay?**: `string`
