[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PhysicsSystem

# Class: PhysicsSystem

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:688](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L688)

Sistema de física AABB sem dependências externas.

Por tick (deltaTime em ms, convertido internamente para segundos):
1. **Gravidade**: aplica `gravity` (unidades/s²) no eixo -Y de todos os
   corpos dinâmicos (`isStatic === false`).
2. **Integração**: Euler explícito — `position += velocity × dt`.
3. **Colisão**: detecta e resolve colisões AABB entre todos os pares de
   entidades elegíveis (O(n²)).

Para cada colisão detectada:
- Calcula o eixo de mínima penetração (MTV — Minimum Translation Vector).
- Separa os corpos ao longo desse eixo.
- Cancela a componente de velocidade na direção da colisão.

Requer que cada entidade possua **ambos** `RigidBodyComponent` e
`ColliderComponent`.

## Example

```ts
const world = new World();
world.addSystem(new PhysicsSystem());

const ball = world.createEntity();
ball.addComponent(Object.assign(new RigidBodyComponent(), {
  position: { x: 0, y: 5, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
}));
ball.addComponent(new ColliderComponent()); // cubo 1×1×1

const floor = world.createEntity();
floor.addComponent(Object.assign(new RigidBodyComponent(), {
  position: { x: 0, y: 0, z: 0 },
  isStatic: true,
}));
floor.addComponent(Object.assign(new ColliderComponent(), {
  size: { x: 10, y: 0.5, z: 10 },
}));

world.tick(16.67); // ~60 FPS
```

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new PhysicsSystem**(): `PhysicsSystem`

#### Returns

`PhysicsSystem`

#### Inherited from

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### gravity

> **gravity**: `number` = `9.8`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:693](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L693)

Aceleração gravitacional em unidades/s² aplicada no eixo -Y.
Padrão: 9.8 (gravidade terrestre). Ajuste conforme as necessidades do jogo.

***

### keepOnClear

> **keepOnClear**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L51)

Se `true`, `World.clear()` PRESERVA este sistema (não chama `dispose`
nem remove) ao trocar de cena. Para overlays que sobrevivem à troca de fase
— ex.: os sistemas do editor F2 (câmera livre, seleção, gizmos). Por padrão
`false` (sistema da cena/jogo, é removido no clear).

#### Inherited from

[`System`](System.md).[`keepOnClear`](System.md#keeponclear)

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L73)

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

> **priority**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L43)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Inherited from

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`RigidBodyComponent`](RigidBodyComponent.md) \| *typeof* [`ColliderComponent`](ColliderComponent.md))[]

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:696](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L696)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L90)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/Physics.ts:704](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Physics.ts#L704)

Executa gravidade, integração e resolução de colisões para o passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades com `RigidBodyComponent` + `ColliderComponent`.

##### deltaTime

`number`

Tempo do passo em **ms** (convertido para s internamente).

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
