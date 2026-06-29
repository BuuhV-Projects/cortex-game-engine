[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / intersectionSpecSchema

# Variable: intersectionSpecSchema

> `const` **intersectionSpecSchema**: `ZodObject`\<\{ `at`: `ZodTuple`\<\[`ZodNumber`, `ZodNumber`\], `null`\>; `id`: `ZodString`; `kind`: `ZodEnum`\<\{ `cross`: `"cross"`; `roundabout`: `"roundabout"`; `tee`: `"tee"`; \}\>; `radius`: `ZodOptional`\<`ZodNumber`\>; `roads`: `ZodArray`\<`ZodString`\>; \}, `$strip`\>

Defined in: [src/road/citySpec.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/citySpec.ts#L26)

Cruzamento DECLARADO (fase 1): onde 2+ vias se encontram.
