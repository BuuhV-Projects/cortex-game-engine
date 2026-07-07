[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TopDownCameraSystem

# Class: TopDownCameraSystem

Defined in: [src/systems/TopDownCameraSystem.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L46)

**Câmera top-down (vista de cima)** — pra jogos 2D de fazenda/RPG (estilo
Stardew). Segue o alvo (entidade com [FollowCameraTargetComponent](FollowCameraTargetComponent.md)) no
**plano XZ** (o chão; Y = altura), com a câmera acima olhando pra baixo. Com
`angle: 0` é vista de cima pura; aumente o `angle` pra um 3/4 inclinado.
Combine com uma câmera **ortográfica** (`Game({ projection: 'orthographic' })`)
pra o look pixel art achatado, ou perspectiva pra leve profundidade.

O alvo se move no plano XZ (X e Z); a física de plataforma (gravidade no Y)
NÃO se aplica a um jogo top-down — use input/movimento próprios no plano.

## Example

```ts
const cam = new TopDownCameraSystem(game.camera, { height: 16, angle: 0 })
game.world.addSystem(cam)
// marque o player como alvo: entity.addComponent(new FollowCameraTargetComponent())
```

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new TopDownCameraSystem**(`camera`, `options?`): `TopDownCameraSystem`

Defined in: [src/systems/TopDownCameraSystem.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L59)

#### Parameters

##### camera

`OrthographicCamera` \| `PerspectiveCamera`

##### options?

[`TopDownCameraOptions`](../interfaces/TopDownCameraOptions.md) = `{}`

#### Returns

`TopDownCameraSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/ecs/System.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L65)

Predicado opcional de PAUSA: se definido e retornar `true` num tick, o
`World` pula o `update` deste sistema nesse frame. Usado, por ex., pra pausar
a gameplay (física/input) enquanto o editor está ativo
(`pauseWhen = () => game.editorActive`).

#### Returns

`boolean`

#### Inherited from

[`System`](System.md).[`pauseWhen`](System.md#pausewhen)

***

### priority

> **priority**: `number` = `30`

Defined in: [src/systems/TopDownCameraSystem.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L48)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`FollowCameraTargetComponent`](FollowCameraTargetComponent.md))[]

Defined in: [src/systems/TopDownCameraSystem.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L47)

Construtores dos componentes que este sistema requer.

O `World` usa essa lista para filtrar as entidades antes de chamar `update`,
garantindo que apenas entidades com todos os componentes declarados sejam
repassadas ao sistema.

Subclasses devem sobrescrever este campo estático.

#### Example

```ts
static requiredComponents = [TransformComponent, VelocityComponent];
```

#### Overrides

[`System`](System.md).[`requiredComponents`](System.md#requiredcomponents)

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/ecs/System.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L82)

Libera recursos ao remover o sistema — chamado por [World.clear](World.md#clear) (e
pode ser chamado manualmente). No-op por padrão; sobrescreva pra liberar
handles nativos que o GC não coleta sozinho (ex.: o mundo do Rapier em
[RapierPhysicsSystem](RapierPhysicsSystem.md)). Essencial pra trocar de cena/fase sem vazar.

#### Returns

`void`

#### Inherited from

[`System`](System.md).[`dispose`](System.md#dispose)

***

### setAngle()

> **setAngle**(`radians`): `void`

Defined in: [src/systems/TopDownCameraSystem.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L77)

Muda a inclinação (0 = reto pra baixo) em runtime.

#### Parameters

##### radians

`number`

#### Returns

`void`

***

### setHeight()

> **setHeight**(`height`): `void`

Defined in: [src/systems/TopDownCameraSystem.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L72)

Muda a distância/altura da câmera em runtime.

#### Parameters

##### height

`number`

#### Returns

`void`

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/TopDownCameraSystem.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownCameraSystem.ts#L81)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`.

##### deltaTime

`number`

Tempo decorrido desde o último tick, em segundos.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
