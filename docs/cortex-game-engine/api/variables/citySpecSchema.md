[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / citySpecSchema

# Variable: citySpecSchema

> `const` **citySpecSchema**: `ZodObject`\<\{ `bounds`: `ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`\], `null`\>\>; `districts`: `ZodDefault`\<`ZodArray`\<`ZodObject`\<\{ `bounds`: `ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`\], `null`\>\>; `id`: `ZodString`; `zone`: `ZodEnum`\<\{ `civic`: `"civic"`; `industrial`: `"industrial"`; `market`: `"market"`; `park`: `"park"`; `residential`: `"residential"`; `transit`: `"transit"`; \}\>; \}, `$strip`\>\>\>; `id`: `ZodString`; `intersections`: `ZodDefault`\<`ZodArray`\<`ZodObject`\<\{ `at`: `ZodTuple`\<\[`ZodNumber`, `ZodNumber`\], `null`\>; `id`: `ZodString`; `kind`: `ZodEnum`\<\{ `cross`: `"cross"`; `roundabout`: `"roundabout"`; `tee`: `"tee"`; \}\>; `radius`: `ZodOptional`\<`ZodNumber`\>; `roads`: `ZodArray`\<`ZodString`\>; \}, `$strip`\>\>\>; `landmarks`: `ZodDefault`\<`ZodArray`\<`ZodObject`\<\{ `at`: `ZodTuple`\<\[`ZodNumber`, `ZodNumber`\], `null`\>; `id`: `ZodString`; `kind`: `ZodString`; \}, `$strip`\>\>\>; `mainFlow`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `roads`: `ZodArray`\<`ZodObject`\<\{ `curveDensity`: `ZodOptional`\<`ZodNumber`\>; `elevation`: `ZodOptional`\<`ZodUnion`\<readonly \[`ZodLiteral`\<`"conform"`\>, `ZodLiteral`\<`"flat"`\>, `ZodNumber`\]\>\>; `id`: `ZodString`; `oneway`: `ZodOptional`\<`ZodBoolean`\>; `points`: `ZodArray`\<`ZodTuple`\<\[`ZodNumber`, `ZodNumber`\], `null`\>\>; `profile`: `ZodEnum`\<\{ `alley`: `"alley"`; `arterial`: `"arterial"`; `dirt`: `"dirt"`; `highway`: `"highway"`; `industrial`: `"industrial"`; `pedestrian_market`: `"pedestrian_market"`; `residential`: `"residential"`; `urban_primary`: `"urban_primary"`; `urban_secondary`: `"urban_secondary"`; \}\>; `speedKmh`: `ZodOptional`\<`ZodNumber`\>; `surface`: `ZodOptional`\<`ZodEnum`\<\{ `asphalt`: `"asphalt"`; `brick`: `"brick"`; `cobblestone`: `"cobblestone"`; `concrete`: `"concrete"`; `dirt`: `"dirt"`; \}\>\>; \}, `$strip`\>\>; \}, `$strip`\>

Defined in: src/road/citySpec.ts:48

Uma cidade (núcleo urbano) dentro da região.
