[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Water

# Class: Water

Defined in: [src/scene/Water.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L87)

Água simples (experimental) pra cenários de ilhas/plataforma: um plano
horizontal grande com material PBR cartoon e, opcionalmente, uma textura de
**cáusticas** tiled e animada (offset deslizante) pra simular o brilho da luz
na superfície.

Não é um shader de água físico (sem reflexão/refração/foam/ondas reais) — é
uma aproximação visual barata, boa pra protótipos e cenas low-poly. Pra um
mar realista, um shader custom WebGPU (TSL) seria necessário.

## Examples

```ts
// Água parada lisa:
new Water(scene, { y: -1.5, color: 0x3b6e8f })
```

```ts
// Água com cáusticas animadas (chame update no loop):
const water = new Water(scene, { y: -1.5, causticsUrl: 'assets/textures/caustics.png' })
// no GameLoop.onUpdate:
water.update(deltaTime / 1000)
```

```ts
// Mar "infinito": passe a câmera e o plano segue o XZ dela, então a borda
// quadrada fica sempre a `size / 2` e some atrás do fog.
const sea = new Water(scene, { y: -6, camera: game.camera, causticsUrl: '…' })
```

## Constructors

### Constructor

> **new Water**(`scene`, `options?`): `Water`

Defined in: [src/scene/Water.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L101)

#### Parameters

##### scene

[`Scene`](Scene.md)

##### options?

[`WaterOptions`](../interfaces/WaterOptions.md) = `{}`

#### Returns

`Water`

## Properties

### mesh

> `readonly` **mesh**: `Mesh`

Defined in: [src/scene/Water.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L89)

O `Mesh` do plano de água, já adicionado à cena.

## Methods

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/scene/Water.ts:164](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L164)

Anima as cáusticas deslizando o offset da textura nos dois eixos. Chame uma
vez por frame passando o delta em **segundos** (`deltaTime / 1000`). No-op
se não houver textura de cáusticas.

#### Parameters

##### deltaSeconds

`number`

Tempo decorrido desde o último frame, em segundos.

#### Returns

`void`
