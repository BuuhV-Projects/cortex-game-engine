[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FirstPersonCameraSystem

# Class: FirstPersonCameraSystem

Defined in: [src/systems/FirstPersonCameraSystem.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L57)

Câmera + controle de **primeira pessoa** (FPS). Mira o único [Entity](Entity.md) com
[TransformComponent](TransformComponent.md) + [CharacterBodyComponent](CharacterBodyComponent.md) (o player cápsula) e:

- **Mouse-look** (com *pointer lock*): mover o mouse gira a visão — yaw em torno
  do Y, pitch em torno do X (clampado). O cursor trava ao **clicar no canvas**.
- **Andar** (WASD/setas): no plano XZ relativo a pra onde se olha (frente/trás +
  strafe); escreve a posição e a `rotationY` no transform. A física vertical
  (gravidade/pulo/aterrar no terreno) fica com o [CharacterBodyComponent](CharacterBodyComponent.md) +
  `CharacterPhysicsSystem`.
- **Pular**: Espaço (na borda de pressão) chama `characterBody.jump()`.
- **Câmera**: posicionada na **altura dos olhos** (pés + `eyeHeight`), olhando na
  direção (yaw, pitch). Como a câmera fica DENTRO do corpo, o **mesh do player é
  escondido enquanto joga** (senão a câmera vê o interior da cápsula) e mostrado
  no editor (pra dar pra selecionar/editar o nó).

Roda em `priority = 20` (depois da física, priority 5) pra usar o Y já integrado.
Estado de yaw/pitch é interno (single-player). Pra outro esquema de input
(gamepad/touch), escreva direto no transform/`CharacterBody`.

## Example

```ts
// tipicamente via setupFirstPerson(game), mas dá pra montar à mão:
const fps = new FirstPersonCameraSystem(game.camera, game.input, game.canvas, {
  moveSpeed: 6,
  pauseWhen: () => game.editorActive,
})
game.world.addSystem(fps)
```

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new FirstPersonCameraSystem**(`camera`, `input`, `canvas`, `options?`): `FirstPersonCameraSystem`

Defined in: [src/systems/FirstPersonCameraSystem.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L73)

#### Parameters

##### camera

`PerspectiveCamera`

##### input

[`InputManager`](InputManager.md)

##### canvas

`HTMLElement`

##### options?

[`FirstPersonCameraOptions`](../interfaces/FirstPersonCameraOptions.md) = `{}`

#### Returns

`FirstPersonCameraSystem`

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

> **priority**: `number` = `20`

Defined in: [src/systems/FirstPersonCameraSystem.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L59)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`CharacterBodyComponent`](CharacterBodyComponent.md))[]

Defined in: [src/systems/FirstPersonCameraSystem.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L58)

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

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/FirstPersonCameraSystem.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L95)

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
