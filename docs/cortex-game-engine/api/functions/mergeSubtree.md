[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / mergeSubtree

# Function: mergeSubtree()

> **mergeSubtree**(`root`, `options?`): [`SubtreeMergeStats`](../interfaces/SubtreeMergeStats.md)

Defined in: [src/scene/StaticMerge.ts:433](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L433)

**Funde as malhas DENTRO de um modelo** (SPEC-0213), agrupando por material e
bakeando no espaço **local de `root`**. O oposto do [mergeStaticScene](mergeStaticScene.md):
serve justamente para o que SE MOVE.

Modelo de catálogo vem com cada peça separada — um carro tem para-choque,
grade, faróis e maçanetas como malhas próprias, e nenhuma se move em relação
ao corpo. Cada uma custa uma draw call. Medido no kart-racer: três carros
somavam 248 das 642 malhas desenhadas da cena.

`root` continua o mesmo objeto, na mesma posição, com o mesmo pai: quem o move
(física, animação, editor) não percebe diferença.

Não funde (a malha fica exatamente como estava): descendente de um `preserve`,
malha com esqueleto, multi-material, geometria com morph targets ou assinatura
de atributos incompatível, e grupo de uma malha só.

## Parameters

### root

`Object3D`

### options?

[`SubtreeMergeOptions`](../interfaces/SubtreeMergeOptions.md) = `{}`

## Returns

[`SubtreeMergeStats`](../interfaces/SubtreeMergeStats.md)

## Example

```ts
// O corpo vira poucas malhas; os pivôs de roda seguem girando.
mergeSubtree(carro, { preserve: rodas, name: 'car-body' });
```
