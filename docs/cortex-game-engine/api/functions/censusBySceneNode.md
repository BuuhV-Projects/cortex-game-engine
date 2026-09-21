[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / censusBySceneNode

# Function: censusBySceneNode()

> **censusBySceneNode**(`scene`, `limit`): \[`string`, `number`\][]

Defined in: [src/core/PerfTrace.ts:194](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L194)

Censo da árvore por nó de cena: quantos `Object3D` cada nó do `level.json`
carrega. Responde "quem são os 1.271 nós" — a pergunta que decide se vale
podar a travessia (cenário estático) ou reduzir malha (modelo com peças
demais), que são trabalhos completamente diferentes.

## Parameters

### scene

`Object3D`

### limit

`number`

## Returns

\[`string`, `number`\][]
