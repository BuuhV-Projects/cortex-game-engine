[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / cullOutlines

# Function: cullOutlines()

> **cullOutlines**(`root`, `cameraPosition`, `minRatio`): [`OutlineCullStats`](../interfaces/OutlineCullStats.md)

Defined in: jge-present/src/scene/OutlineCulling.ts:78

Percorre `root` e liga/desliga a casca de contorno por tamanho angular
relativo a `cameraPosition`.

## Parameters

### root

`Object3D`

Raiz da cena (matrizes de mundo já atualizadas).

### cameraPosition

`Vector3`

Posição da câmera que está renderizando o frame.

### minRatio

`number`

Limiar `raio/distância`; `0` restaura a autoria e sai.

## Returns

[`OutlineCullStats`](../interfaces/OutlineCullStats.md)
