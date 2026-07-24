[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setFog

# Function: setFog()

> **setFog**(`object`, `enabled`): `void`

Defined in: [src/scene/SceneAssets.ts:137](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L137)

Liga/desliga a **névoa da cena** nos materiais de um objeto.

A `fog` é global e tinge tudo em função da distância — inclusive o que está
longe **de propósito**: um planeta, uma montanha, um marco de horizonte cuja
função é justamente ser lido de longe. Com névoa forte esses marcos perdem a
cor própria e viram todos do mesmo tom. Isentá-los devolve a cor sem abrir
mão da profundidade que a névoa dá ao resto da cena.

## Parameters

### object

`Object3D`

O objeto (ou grupo) a configurar.

### enabled

`boolean`

`false` exclui o objeto da névoa.

## Returns

`void`

## Example

```ts
setFog(planet, false) // o planeta de fundo mantém a cor própria
```
