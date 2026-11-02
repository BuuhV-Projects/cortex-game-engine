[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / NativeModelDef

# Interface: NativeModelDef

Defined in: [src/render/native/models/NativeModel.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L43)

## Properties

### attributeTypes?

> `readonly` `optional` **attributeTypes?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/render/native/models/NativeModel.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L60)

WGSL type of each own attribute of the model, by geometry attribute name (a game WGSL, SPEC-0565):
e.g. `{ instancePaint: 'vec3<f32>', paintMask: 'f32' }`. An `InstancedBufferAttribute` is per instance.

***

### name

> `readonly` **name**: `string`

Defined in: [src/render/native/models/NativeModel.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L45)

Name the classifier gives (`unlit`, `lambert`, …, or `wgsl:<game material>`).

***

### paramFloats

> `readonly` **paramFloats**: `number`

Defined in: [src/render/native/models/NativeModel.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L64)

Floats of the material params block (a multiple of 4: std140 rows); starts with the color rgb.

## Methods

### attributes()

> **attributes**(`variant`): readonly `string`[]

Defined in: [src/render/native/models/NativeModel.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L55)

Vertex attributes the variant reads, in location order (`position` first): the
[VertexSemantic](../type-aliases/VertexSemantic.md)s, or a geometry attribute named in [attributeTypes](#attributetypes).

#### Parameters

##### variant

readonly `string`[]

#### Returns

readonly `string`[]

***

### textures()

> **textures**(`material`, `variant`): readonly `unknown`[]

Defined in: [src/render/native/models/NativeModel.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L72)

Textures bound in group 2 after the params UBO, one sampler + texture pair each, visible in the
vertex and fragment stages. A `FloatType` texture (a `DataTexture` of per-instance data) is
bound `unfilterable-float` with a `non-filtering` sampler: read it with `textureLoad`.

#### Parameters

##### material

`Material`

##### variant

readonly `string`[]

#### Returns

readonly `unknown`[]

***

### variant()

> **variant**(`c`, `object`, `material`): `string`[] \| `null`

Defined in: [src/render/native/models/NativeModel.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L50)

Variant key for the MATERIAL features (the core already removed and checked the
object/pipeline ones), or `null` = refused (the three keeps the object).

#### Parameters

##### c

`Classification` & `object`

##### object

`Object3D`

##### material

`Material`

#### Returns

`string`[] \| `null`

***

### wgsl()

> **wgsl**(`variant`): `string`

Defined in: [src/render/native/models/NativeModel.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L62)

WGSL of the variant: a `vs(vin : VIn) -> …` and an `fs`, against `coreWgsl`.

#### Parameters

##### variant

readonly `string`[]

#### Returns

`string`

***

### writeParams()

> **writeParams**(`material`, `out`): `void`

Defined in: [src/render/native/models/NativeModel.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/render/native/models/NativeModel.ts#L66)

Writes the material params into `out` (the snapshot that detects a change, too).

#### Parameters

##### material

`Material`

##### out

`Float32Array`

#### Returns

`void`
