[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setMatte

# Function: setMatte()

> **setMatte**(`object`, `options?`): `void`

Defined in: [src/scene/SceneAssets.ts:121](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L121)

Deixa os materiais de um objeto **foscos** — mata o brilho plástico/PBR que os
`.glb` stylized vêm por padrão. Zera o specular e o reflexo do ambiente
(`roughness=1`, `metalness=0`, `envMapIntensity=0`), dando o aspecto
**cartoon/fosco/desenho** em vez do "brilhoso". As texturas (mapas de cor)
continuam intactas. Aplique no objeto instanciado, ou na raiz da cena pra
deixar tudo fosco de uma vez.

## Parameters

### object

`Object3D`

### options?

[`MatteOptions`](../interfaces/MatteOptions.md) = `{}`

## Returns

`void`

## Example

```ts
const tree = instance(await loadGLB('assets/tree.glb'))
scene.add(tree); setMatte(tree)
// ou tudo de uma vez: setMatte(scene.getThreeScene())
```
