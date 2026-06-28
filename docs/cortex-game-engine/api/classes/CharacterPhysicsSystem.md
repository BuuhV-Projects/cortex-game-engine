[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CharacterPhysicsSystem

# Class: CharacterPhysicsSystem

Defined in: [src/systems/CharacterPhysicsSystem.ts:133](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L133)

Física vertical do [CharacterBodyComponent](CharacterBodyComponent.md) (character controller estilo
UPBGE/Unity): aplica **gravidade** (limitada por `fallSpeedMax`), processa o
**pulo** (`jumpForce` até `maxJumps`), integra o Y e **aterra por COLISÃO** —
tudo no **mesmo tick** (sem oscilar/tremer).

**Chão (estável):**
- **Colisão real (tipo Unity):** se receber as raízes da cena, faz um **raycast
  pra baixo** sob os pés e pousa na **geometria real** (terreno, tiles,
  plataformas) em qualquer altura — sobe degraus até `stepHeight`, ignora o
  próprio mesh. Só aterra **caindo** (velocidade ≤ 0) e quando os pés alcançam a
  superfície (curta distância por frame), então não "gruda" no ar nem treme.
- **Piso plano `groundY` (fallback):** rede de segurança — se não houver
  geometria embaixo, aterra nessa altura (não cai no vazio). Default `-Infinity`.

O movimento horizontal (X/Z ou X/Y) fica com o input do jogo; o sistema cuida do
Y. Pivô nos **pés** (`transform.y` = base). Roda na física (priority 5).

## Example

```ts
// com colisão real (recomendado): passe as raízes da cena
world.addSystem(new CharacterPhysicsSystem([game.scene.getThreeScene()]))
// sem colisão (só piso plano via CharacterBody.groundY):
world.addSystem(new CharacterPhysicsSystem())
```

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new CharacterPhysicsSystem**(`roots?`): `CharacterPhysicsSystem`

Defined in: [src/systems/CharacterPhysicsSystem.ts:147](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L147)

#### Parameters

##### roots?

`Object3D`\<`Object3DEventMap`\>[] = `[]`

Raízes da cena pra colisão de chão (raycast). Vazio = só `groundY`.

#### Returns

`CharacterPhysicsSystem`

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

> **priority**: `number` = `5`

Defined in: [src/systems/CharacterPhysicsSystem.ts:135](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L135)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`CharacterBodyComponent`](CharacterBodyComponent.md))[]

Defined in: [src/systems/CharacterPhysicsSystem.ts:134](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L134)

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

### update()

> **update**(`entities`, `deltaTime`): `void`

Defined in: [src/systems/CharacterPhysicsSystem.ts:152](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/CharacterPhysicsSystem.ts#L152)

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
