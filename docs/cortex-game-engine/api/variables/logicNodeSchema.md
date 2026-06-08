[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / logicNodeSchema

# Variable: logicNodeSchema

> `const` **logicNodeSchema**: `ZodOptional`\<`ZodObject`\<\{ `actuators`: `ZodDefault`\<`ZodArray`\<`ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `id`: `ZodString`; `loc`: `ZodOptional`\<`ZodTuple`\<..., ...\>\>; `perSecond`: `ZodOptional`\<`ZodBoolean`\>; `rot`: `ZodOptional`\<`ZodTuple`\<..., ...\>\>; `type`: `ZodLiteral`\<`"motion"`\>; \}, `$strip`\>, `ZodObject`\<\{ `clip`: `ZodString`; `id`: `ZodString`; `loop`: `ZodOptional`\<`ZodBoolean`\>; `type`: `ZodLiteral`\<`"animation"`\>; \}, `$strip`\>\], `"type"`\>\>\>; `controllers`: `ZodDefault`\<`ZodArray`\<`ZodObject`\<\{ `actuators`: `ZodDefault`\<`ZodArray`\<`ZodString`\>\>; `id`: `ZodString`; `op`: `ZodOptional`\<`ZodEnum`\<\{ `and`: `"and"`; `or`: `"or"`; \}\>\>; `sensors`: `ZodDefault`\<`ZodArray`\<`ZodString`\>\>; \}, `$strip`\>\>\>; `sensors`: `ZodDefault`\<`ZodArray`\<`ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `id`: `ZodString`; `type`: `ZodLiteral`\<`"always"`\>; \}, `$strip`\>, `ZodObject`\<\{ `edge`: `ZodOptional`\<`ZodBoolean`\>; `id`: `ZodString`; `key`: `ZodString`; `type`: `ZodLiteral`\<`"key"`\>; \}, `$strip`\>\], `"type"`\>\>\>; \}, `$strip`\>\>

Defined in: src/scene/LogicBricks.ts:73

Schema exportado pro `SceneDefinition` reusar o campo `logic`.
