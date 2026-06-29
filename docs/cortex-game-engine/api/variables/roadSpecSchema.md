[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / roadSpecSchema

# Variable: roadSpecSchema

> `const` **roadSpecSchema**: `ZodObject`\<\{ `curveDensity`: `ZodOptional`\<`ZodNumber`\>; `elevation`: `ZodOptional`\<`ZodUnion`\<readonly \[`ZodLiteral`\<`"conform"`\>, `ZodLiteral`\<`"flat"`\>, `ZodNumber`\]\>\>; `id`: `ZodString`; `oneway`: `ZodOptional`\<`ZodBoolean`\>; `points`: `ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`\], `null`\>\>; `profile`: `ZodEnum`\<\{ `alley`: `"alley"`; `arterial`: `"arterial"`; `dirt`: `"dirt"`; `highway`: `"highway"`; `industrial`: `"industrial"`; `pedestrian_market`: `"pedestrian_market"`; `residential`: `"residential"`; `urban_primary`: `"urban_primary"`; `urban_secondary`: `"urban_secondary"`; \}\>; `speedKmh`: `ZodOptional`\<`ZodNumber`\>; `surface`: `ZodOptional`\<`ZodEnum`\<\{ `asphalt`: `"asphalt"`; `brick`: `"brick"`; `cobblestone`: `"cobblestone"`; `concrete`: `"concrete"`; `dirt`: `"dirt"`; \}\>\>; \}, `$strip`\>

Defined in: [src/road/citySpec.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/citySpec.ts#L13)

Uma via traçada (sobre o underlay): perfil + pontos de controle da spline.
