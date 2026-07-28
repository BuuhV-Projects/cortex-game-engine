[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / System

# Abstract Class: System

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L36)

Classe base para todos os sistemas do ECS.

Cada sistema encapsula **lógica** que opera sobre entidades que possuem
um conjunto específico de componentes. O `World` filtra as entidades via
`World.query(requiredComponents)` e as repassa ao `update` de cada sistema
em ordem crescente de `priority` a cada tick — vide ADR-0002.

Subclasses devem:
1. Declarar `static requiredComponents` com os construtores dos componentes
   que serão acessados dentro de `update`.
2. Implementar `update(entities, deltaTime)` com a lógica do sistema.

## Example

```ts
class MovementSystem extends System {
  static requiredComponents = [TransformComponent, VelocityComponent];

  update(entities: Entity[], deltaTime: number): void {
    for (const entity of entities) {
      const transform = entity.getComponent(TransformComponent)!;
      const velocity = entity.getComponent(VelocityComponent)!;
      transform.position.x += velocity.x * deltaTime;
    }
  }
}
```

## Extended by

- [`PhysicsSystem`](PhysicsSystem.md)
- [`ScriptHostSystem`](ScriptHostSystem.md)
- [`Object3DSyncSystem`](Object3DSyncSystem.md)
- [`ThirdPersonCameraSystem`](ThirdPersonCameraSystem.md)
- [`FirstPersonCameraSystem`](FirstPersonCameraSystem.md)
- [`PlatformerPhysicsSystem`](PlatformerPhysicsSystem.md)
- [`PlatformerInputSystem`](PlatformerInputSystem.md)
- [`FollowCamera2DSystem`](FollowCamera2DSystem.md)
- [`TopDownCameraSystem`](TopDownCameraSystem.md)
- [`TopDownMovementSystem`](TopDownMovementSystem.md)
- [`TerrainCollisionSystem`](TerrainCollisionSystem.md)
- [`CharacterPhysicsSystem`](CharacterPhysicsSystem.md)
- [`InteractionSystem`](InteractionSystem.md)
- [`VehicleControlSystem`](VehicleControlSystem.md)
- [`SkidMarkSystem`](SkidMarkSystem.md)
- [`ThirdPersonControlSystem`](ThirdPersonControlSystem.md)
- [`RapierPhysicsSystem`](RapierPhysicsSystem.md)
- [`PlatformerAnimationSystem`](PlatformerAnimationSystem.md)
- [`SpriteAnimationSystem`](SpriteAnimationSystem.md)
- [`CellStreamingSystem`](CellStreamingSystem.md)

## Constructors

### Constructor

> **new System**(): `System`

#### Returns

`System`

## Properties

### keepOnClear

> **keepOnClear**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L51)

Se `true`, `World.clear()` PRESERVA este sistema (não chama `dispose`
nem remove) ao trocar de cena. Para overlays que sobrevivem à troca de fase
— ex.: os sistemas do editor F2 (câmera livre, seleção, gizmos). Por padrão
`false` (sistema da cena/jogo, é removido no clear).

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

***

### priority

> **priority**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L43)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

***

### requiredComponents

> `static` **requiredComponents**: `ComponentClass`[] = `[]`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L65)

Construtores dos componentes que este sistema requer.

O `World` usa essa lista para filtrar as entidades antes de chamar `update`,
garantindo que apenas entidades com todos os componentes declarados sejam
repassadas ao sistema.

Subclasses devem sobrescrever este campo estático.

#### Example

```ts
static requiredComponents = [TransformComponent, VelocityComponent];
```

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

***

### update()

> `abstract` **update**(`entities`, `deltaTime`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/System.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L82)

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
