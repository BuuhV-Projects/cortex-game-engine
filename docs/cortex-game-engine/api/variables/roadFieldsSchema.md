[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadFieldsSchema

# Variable: roadFieldsSchema

> `const` **roadFieldsSchema**: `ZodObject`\<\{ `clearance`: `ZodOptional`\<`ZodNumber`\>; `color`: `ZodOptional`\<`ZodUnion`\<\[`ZodNumber`, `ZodString`\]\>\>; `drivable`: `ZodOptional`\<`ZodBoolean`\>; `grade`: `ZodOptional`\<`ZodEnum`\<\[`"terrain"`, `"points"`\]\>\>; `maxSlope`: `ZodOptional`\<`ZodNumber`\>; `points`: `ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`, `ZodNumber`\], `null`\>, `"many"`\>; `smooth`: `ZodOptional`\<`ZodNumber`\>; `steps`: `ZodOptional`\<`ZodNumber`\>; `talude`: `ZodOptional`\<`ZodNumber`\>; `texture`: `ZodOptional`\<`ZodString`\>; `tile`: `ZodOptional`\<`ZodNumber`\>; `width`: `ZodOptional`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `clearance?`: `number`; `color?`: `string` \| `number`; `drivable?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `maxSlope?`: `number`; `points`: \[`number`, `number`, `number`\][]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `width?`: `number`; \}, \{ `clearance?`: `number`; `color?`: `string` \| `number`; `drivable?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `maxSlope?`: `number`; `points`: \[`number`, `number`, `number`\][]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `width?`: `number`; \}\>

Defined in: [src/road/roadFields.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/roadFields.ts#L19)

Campos editáveis da estrada (todos opcionais, exceto `points` no nó).
