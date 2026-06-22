[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ShapeDef

# Interface: ShapeDef

Defined in: src/probuilder/shapes.ts:39

Descreve uma forma: rótulo, parâmetros e o builder.

## Properties

### kind

> **kind**: [`ShapeKind`](../type-aliases/ShapeKind.md)

Defined in: src/probuilder/shapes.ts:40

***

### label

> **label**: `string`

Defined in: src/probuilder/shapes.ts:41

***

### params

> **params**: [`ShapeParamDef`](ShapeParamDef.md)[]

Defined in: src/probuilder/shapes.ts:42

## Methods

### build()

> **build**(`p`): [`EditableMesh`](EditableMesh.md)

Defined in: src/probuilder/shapes.ts:43

#### Parameters

##### p

`Record`\<`string`, `number`\>

#### Returns

[`EditableMesh`](EditableMesh.md)
