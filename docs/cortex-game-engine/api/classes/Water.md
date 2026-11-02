[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Water

# Class: Water

Defined in: [src/scene/Water.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L104)

Água simples (experimental) pra cenários de ilhas/plataforma: um plano
horizontal grande com material PBR cartoon e, opcionalmente, uma textura de
**cáusticas** tiled e animada (offset deslizante) pra simular o brilho da luz
na superfície.

O modo `style: 'cartoon'` usa ondas analíticas e espuma de contato na GPU,
com perturbações locais via [Water.addRipple](#addripple). Não simula volume nem
refração; o brilho do céu é uma aproximação estilizada, sem passe de reflexão.

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

Defined in: [src/scene/Water.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L120)

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

Defined in: [src/scene/Water.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L106)

O `Mesh` do plano de água, já adicionado à cena.

## Methods

### addRipple()

> **addRipple**(`position`, `strength?`): `boolean`

Defined in: [src/scene/Water.ts:225](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L225)

Cria uma ondulação local em coordenadas do mundo, sem alocar malhas.
O pool guarda até oito impactos; um novo substitui o mais antigo.

#### Parameters

##### position

###### x

`number`

###### z

`number`

##### strength?

`number` = `1`

#### Returns

`boolean`

`false` no modo simples, que não oferece perturbações.

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/Water.ts:241](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L241)

Remove a superfície e libera a geometria, o material e a textura carregada.

#### Returns

`void`

***

### refreshShoreline()

> **refreshShoreline**(): `void`

Defined in: [src/scene/Water.ts:236](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L236)

Reconstrói a máscara de espuma onde a geometria visível cruza o nível médio.
Chame após carregar ou mover terreno; `buildScene` chama no carregamento.
Não acompanha objetos móveis automaticamente. No modo simples não faz nada.

#### Returns

`void`

***

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/scene/Water.ts:195](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Water.ts#L195)

Atualiza ondas, perturbações ou cáusticas e acompanha a câmera configurada.
Chame uma vez por quadro passando o delta em **segundos** (`deltaTime / 1000`).

#### Parameters

##### deltaSeconds

`number`

Tempo decorrido desde o último frame, em segundos.

#### Returns

`void`
