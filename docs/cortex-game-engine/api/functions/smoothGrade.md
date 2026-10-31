[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / smoothGrade

# Function: smoothGrade()

> **smoothGrade**(`samples`, `refY`, `opts?`): `number`[]

Defined in: [src/road/RoadGrade.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L47)

**Greide** da estrada: a partir da altura de referência sob cada amostra (`refY`, mesmo
tamanho de `samples` — a base do terreno ou o Y da curva), alisa por média móvel em
**metros** e limita a inclinação a `maxSlope` (passadas pra frente e pra trás; a média
das duas respeita o limite).

## Parameters

### samples

readonly [`RoadSample`](../interfaces/RoadSample.md)[]

### refY

readonly `number`[]

### opts?

[`GradeOptions`](../interfaces/GradeOptions.md) = `{}`

## Returns

`number`[]

um Y por amostra. Com <2 amostras devolve `refY` como veio.

## Example

```ts
const grade = smoothGrade(samples, terrainY, { maxSlope: 0.12 })
```
