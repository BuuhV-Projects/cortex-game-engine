[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadOverlaySchema

# Variable: roadOverlaySchema

> `const` **roadOverlaySchema**: `ZodObject`\<\{ `color`: `ZodOptional`\<`ZodOptional`\<`ZodUnion`\<\[`ZodNumber`, `ZodString`\]\>\>\>; `drivable`: `ZodOptional`\<`ZodOptional`\<`ZodBoolean`\>\>; `grade`: `ZodOptional`\<`ZodOptional`\<`ZodEnum`\<\[`"terrain"`, `"points"`\]\>\>\>; `maxSlope`: `ZodOptional`\<`ZodOptional`\<`ZodNumber`\>\>; `points`: `ZodOptional`\<`ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`, `ZodNumber`\], `null`\>, `"many"`\>\>; `smooth`: `ZodOptional`\<`ZodOptional`\<`ZodNumber`\>\>; `steps`: `ZodOptional`\<`ZodOptional`\<`ZodNumber`\>\>; `talude`: `ZodOptional`\<`ZodOptional`\<`ZodNumber`\>\>; `texture`: `ZodOptional`\<`ZodOptional`\<`ZodString`\>\>; `tile`: `ZodOptional`\<`ZodOptional`\<`ZodNumber`\>\>; `width`: `ZodOptional`\<`ZodOptional`\<`ZodNumber`\>\>; \}, `"strip"`, `ZodTypeAny`, \{ `color?`: `string` \| `number`; `drivable?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `maxSlope?`: `number`; `points?`: \[`number`, `number`, `number`\][]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `width?`: `number`; \}, \{ `color?`: `string` \| `number`; `drivable?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `maxSlope?`: `number`; `points?`: \[`number`, `number`, `number`\][]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `width?`: `number`; \}\>

Defined in: src/road/roadFields.ts:46

Edição do overlay (`data.road[id]`): qualquer subconjunto dos campos.
