[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ThirdPersonControlSystem

# Class: ThirdPersonControlSystem

Defined in: [src/systems/ThirdPersonControlSystem.ts:97](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L97)

**Controle de terceira pessoa** — porta o `ThirdPersonController` do Unity
StarterAssets (comportamento; a arte é separada): câmera **orbital por mouse**
(pointer lock, pitch clampado), **movimento relativo à câmera** (WASD), o
personagem **vira suavemente** pra direção do movimento, **corre** com Shift e
**pula** com Espaço (sobre o [CharacterBodyComponent](CharacterBodyComponent.md) — gravidade/colisão).
Também dirige a **animação** (idle/walk/run/jump/fall) do `.glb` via
`SceneAnimator` (em `userData.cortexAnim`).

Mira a única entidade com [TransformComponent](TransformComponent.md) + [CharacterBodyComponent](CharacterBodyComponent.md).
Roda em `priority = 20` (depois da física). Pausa no editor via `pauseWhen`.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new ThirdPersonControlSystem**(`camera`, `input`, `canvas`, `options?`, `gamepad?`, `collisionRoot?`): `ThirdPersonControlSystem`

Defined in: [src/systems/ThirdPersonControlSystem.ts:130](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L130)

#### Parameters

##### camera

`PerspectiveCamera`

##### input

[`InputManager`](InputManager.md)

##### canvas

`HTMLElement`

##### options?

[`ThirdPersonControlOptions`](../interfaces/ThirdPersonControlOptions.md) = `{}`

##### gamepad?

[`GamepadManager`](GamepadManager.md)

##### collisionRoot?

`Object3D`\<`Object3DEventMap`\>

Raiz da cena pra COLISÃO de câmera (spring arm): se algo fica entre o alvo e a
câmera (chão/árvore/parede), a câmera é puxada pra dentro. Opcional.

#### Returns

`ThirdPersonControlSystem`

#### Overrides

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### keepOnClear

> **keepOnClear**: `boolean` = `false`

Defined in: [src/ecs/System.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L51)

Se `true`, `World.clear()` PRESERVA este sistema (não chama `dispose`
nem remove) ao trocar de cena. Para overlays que sobrevivem à troca de fase
— ex.: os sistemas do editor F2 (câmera livre, seleção, gizmos). Por padrão
`false` (sistema da cena/jogo, é removido no clear).

#### Inherited from

[`System`](System.md).[`keepOnClear`](System.md#keeponclear)

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/ecs/System.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L73)

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

Defined in: [src/systems/ThirdPersonControlSystem.ts:99](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L99)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`CharacterBodyComponent`](CharacterBodyComponent.md))[]

Defined in: [src/systems/ThirdPersonControlSystem.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L98)

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

Defined in: [src/ecs/System.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L90)

Libera recursos ao remover o sistema — chamado por [World.clear](World.md#clear) (e
pode ser chamado manualmente). No-op por padrão; sobrescreva pra liberar
handles nativos que o GC não coleta sozinho (ex.: o mundo do Rapier em
[RapierPhysicsSystem](RapierPhysicsSystem.md)). Essencial pra trocar de cena/fase sem vazar.

#### Returns

`void`

#### Inherited from

[`System`](System.md).[`dispose`](System.md#dispose)

***

### playAction()

> **playAction**(`clip`, `duration`): `void`

Defined in: [src/systems/ThirdPersonControlSystem.ts:187](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L187)

Toca uma **ação one-shot** (soco, aceno, etc.) por `duration` segundos, sobrepondo
a locomoção — o jogo chama isso num botão (combate/interação). O clipe precisa
existir no `.glb`; senão é ignorado.

#### Parameters

##### clip

`string`

##### duration

`number`

#### Returns

`void`

***

### setOrbit()

> **setOrbit**(`mode`, `angles?`): `void`

Defined in: [src/systems/ThirdPersonControlSystem.ts:172](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L172)

Troca o modo de câmera em runtime (ótimo pra A/B testar): `locked` fixa
yaw/pitch/distância nos valores passados (ou mantém os atuais); `free` volta
a órbita por mouse/stick. Sai do pointer lock ao travar.

#### Parameters

##### mode

`"free"` \| `"locked"`

##### angles?

###### distance?

`number`

###### pitch?

`number`

###### yaw?

`number`

#### Returns

`void`

***

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/ThirdPersonControlSystem.ts:192](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/ThirdPersonControlSystem.ts#L192)

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
