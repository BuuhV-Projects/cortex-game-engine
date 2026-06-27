[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / smoothGrade

# Function: smoothGrade()

> **smoothGrade**(`samples`, `terrainY`, `opts?`): `number`[]

Defined in: [src/road/RoadGrade.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/RoadGrade.ts#L52)

**Greide suavizado** da estrada: dado o perfil de altura do terreno sob cada
amostra da spline (`terrainY`, mesmo tamanho de `samples`), devolve um Y por
amostra que (1) **alisa** bossas pequenas por média móvel e (2) **limita a
inclinação** a `maxSlope` (passes pra frente e pra trás). O resultado é o perfil
que a pista segue e ao qual o terreno será moldado.

Puro/determinístico. Se `samples` tem <2 pontos, devolve `terrainY` como veio.

## Parameters

### samples

[`RoadSample`](../interfaces/RoadSample.md)[]

### terrainY

`number`[]

### opts?

[`GradeOptions`](../interfaces/GradeOptions.md) = `{}`

## Returns

`number`[]
