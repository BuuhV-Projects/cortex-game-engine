[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / scatter

# Function: scatter()

> **scatter**(`scene`, `url`, `count`, `area`, `options?`): `Promise`\<`Object3D`\<`Object3DEventMap`\>[]\>

Defined in: [src/scene/SceneAssets.ts:376](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L376)

Espalha `count` cópias de um `.glb` aleatoriamente dentro de uma área
retangular, cada uma assentada no chão com rotação/escala variadas — pra
vegetação e detalhes em clusters naturais (não em grid).

## Parameters

### scene

[`Scene`](../classes/Scene.md)

Cena onde adicionar.

### url

`string`

Caminho do `.glb`.

### count

`number`

Quantas instâncias.

### area

Centro `(x,z)`, tamanho `(w,d)` e altura da base `y`.

#### d

`number`

#### w

`number`

#### x

`number`

#### y

`number`

#### z

`number`

### options?

Faixas de escala/rotação e sombras.

#### rotY?

\[`number`, `number`\]

#### scale?

\[`number`, `number`\]

#### shadows?

[`ShadowOptions`](../interfaces/ShadowOptions.md)

## Returns

`Promise`\<`Object3D`\<`Object3DEventMap`\>[]\>

Os objetos criados.
