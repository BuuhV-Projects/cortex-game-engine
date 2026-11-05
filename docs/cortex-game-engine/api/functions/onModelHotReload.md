[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / onModelHotReload

# Function: onModelHotReload()

> **onModelHotReload**(`cb`): () => `void`

Defined in: src/scene/ModelHotReload.ts:76

Avisa quando o [hotReloadModel](hotReloadModel.md) troca os filhos de uma raiz — para o jogo religar
referências a filhos (rig de carro, rodas, sockets).

## Parameters

### cb

`ModelHotReloadListener`

## Returns

Função que cancela a inscrição.

() => `void`

## Example

```ts
onModelHotReload(({ root }) => { if (root === car) rig = buildCarRig(car) })
```
