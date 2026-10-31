[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadFieldsSchema

# Variable: roadFieldsSchema

> `const` **roadFieldsSchema**: `ZodObject`\<\{ `color`: `ZodOptional`\<`ZodUnion`\<\[`ZodNumber`, `ZodString`\]\>\>; `drivable`: `ZodOptional`\<`ZodBoolean`\>; `grade`: `ZodOptional`\<`ZodEnum`\<\[`"terrain"`, `"points"`\]\>\>; `maxSlope`: `ZodOptional`\<`ZodNumber`\>; `points`: `ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`, `ZodNumber`\], `null`\>, `"many"`\>; `smooth`: `ZodOptional`\<`ZodNumber`\>; `steps`: `ZodOptional`\<`ZodNumber`\>; `talude`: `ZodOptional`\<`ZodNumber`\>; `texture`: `ZodOptional`\<`ZodString`\>; `tile`: `ZodOptional`\<`ZodNumber`\>; `width`: `ZodOptional`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `color?`: `string` \| `number`; `drivable?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `maxSlope?`: `number`; `points`: \[`number`, `number`, `number`\][]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `width?`: `number`; \}, \{ `color?`: `string` \| `number`; `drivable?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `maxSlope?`: `number`; `points`: \[`number`, `number`, `number`\][]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `width?`: `number`; \}\>

Defined in: src/road/roadFields.ts:17

Campos editáveis da estrada (todos opcionais, exceto `points` no nó).
