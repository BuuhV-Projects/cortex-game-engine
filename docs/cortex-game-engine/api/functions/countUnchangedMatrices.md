[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / countUnchangedMatrices

# Function: countUnchangedMatrices()

> **countUnchangedMatrices**(`scene`, `previous`): `number`

Defined in: [src/core/PerfTrace.ts:162](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L162)

Quantos nós tiveram a **matriz local inalterada** desde a amostra anterior.

É o número que dimensiona a poda de recomposição de matriz: só quem nunca
muda pode ter o compose desligado com segurança. Medido na corrida de
verdade, não na cena parada — com a cena parada a resposta seria "todos", que
é verdadeira e inútil.

Compara a matriz composta, e não `position`/`quaternion`, porque é ela que o
`updateMatrix` recalcula; guardar 16 floats por nó duas vezes por segundo é
barato perto de recompor 1.271 matrizes 60 vezes por segundo. Em `Float64Array`
e não `Float32`: arredondar faria mudança pequena passar por "sem mudança" e
inflaria justamente o número que decide se a poda vale.

## Parameters

### scene

`Object3D`

### previous

`Map`\<`number`, `Float64Array`\<`ArrayBufferLike`\>\>

## Returns

`number`
