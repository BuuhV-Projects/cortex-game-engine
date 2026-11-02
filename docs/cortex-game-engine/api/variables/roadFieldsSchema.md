[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadFieldsSchema

# Variable: roadFieldsSchema

> `const` **roadFieldsSchema**: `ZodObject`\<\{ `bridge`: `ZodOptional`\<`ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`\], `null`\>, `"many"`\>\>; `bridgeParts`: `ZodOptional`\<`ZodObject`\<\{ `deck`: `ZodOptional`\<`ZodString`\>; `pillar`: `ZodOptional`\<`ZodString`\>; `pillarEvery`: `ZodOptional`\<`ZodNumber`\>; `rail`: `ZodOptional`\<`ZodString`\>; `scale`: `ZodOptional`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `deck?`: `string`; `pillar?`: `string`; `pillarEvery?`: `number`; `rail?`: `string`; `scale?`: `number`; \}, \{ `deck?`: `string`; `pillar?`: `string`; `pillarEvery?`: `number`; `rail?`: `string`; `scale?`: `number`; \}\>\>; `clearance`: `ZodOptional`\<`ZodNumber`\>; `color`: `ZodOptional`\<`ZodUnion`\<\[`ZodNumber`, `ZodString`\]\>\>; `drivable`: `ZodOptional`\<`ZodBoolean`\>; `grade`: `ZodOptional`\<`ZodEnum`\<\[`"terrain"`, `"points"`\]\>\>; `maxSlope`: `ZodOptional`\<`ZodNumber`\>; `points`: `ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`, `ZodNumber`\], `null`\>, `"many"`\>; `smooth`: `ZodOptional`\<`ZodNumber`\>; `steps`: `ZodOptional`\<`ZodNumber`\>; `talude`: `ZodOptional`\<`ZodNumber`\>; `texture`: `ZodOptional`\<`ZodString`\>; `tile`: `ZodOptional`\<`ZodNumber`\>; `width`: `ZodOptional`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `bridge?`: \[`number`, `number`\][]; `bridgeParts?`: \{ `deck?`: `string`; `pillar?`: `string`; `pillarEvery?`: `number`; `rail?`: `string`; `scale?`: `number`; \}; `clearance?`: `number`; `color?`: `string` \| `number`; `drivable?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `maxSlope?`: `number`; `points`: \[`number`, `number`, `number`\][]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `width?`: `number`; \}, \{ `bridge?`: \[`number`, `number`\][]; `bridgeParts?`: \{ `deck?`: `string`; `pillar?`: `string`; `pillarEvery?`: `number`; `rail?`: `string`; `scale?`: `number`; \}; `clearance?`: `number`; `color?`: `string` \| `number`; `drivable?`: `boolean`; `grade?`: `"points"` \| `"terrain"`; `maxSlope?`: `number`; `points`: \[`number`, `number`, `number`\][]; `smooth?`: `number`; `steps?`: `number`; `talude?`: `number`; `texture?`: `string`; `tile?`: `number`; `width?`: `number`; \}\>

Defined in: [src/road/roadFields.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/roadFields.ts#L34)

Campos editáveis da estrada (todos opcionais, exceto `points` no nó).
