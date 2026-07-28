[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ShapeDef

# Interface: ShapeDef

Defined in: [.claude/worktrees/feat-input-rebind/src/probuilder/shapes.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/shapes.ts#L39)

Descreve uma forma: rótulo, parâmetros e o builder.

## Properties

### kind

> **kind**: [`ShapeKind`](../type-aliases/ShapeKind.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/probuilder/shapes.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/shapes.ts#L40)

***

### label

> **label**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/probuilder/shapes.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/shapes.ts#L41)

***

### params

> **params**: [`ShapeParamDef`](ShapeParamDef.md)[]

Defined in: [.claude/worktrees/feat-input-rebind/src/probuilder/shapes.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/shapes.ts#L42)

## Methods

### build()

> **build**(`p`): [`EditableMesh`](EditableMesh.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/probuilder/shapes.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/probuilder/shapes.ts#L43)

#### Parameters

##### p

`Record`\<`string`, `number`\>

#### Returns

[`EditableMesh`](EditableMesh.md)
