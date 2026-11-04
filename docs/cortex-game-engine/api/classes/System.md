[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / System

# Abstract Class: System

Defined in: [src/ecs/System.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L36)

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
- [`VehicleArcadeSystem`](VehicleArcadeSystem.md)
- [`VehicleDriverSystem`](VehicleDriverSystem.md)
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

Defined in: [src/ecs/System.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L51)

Se `true`, `World.clear()` PRESERVA este sistema (não chama `dispose`
nem remove) ao trocar de cena. Para overlays que sobrevivem à troca de fase
— ex.: os sistemas do editor F2 (câmera livre, seleção, gizmos). Por padrão
`false` (sistema da cena/jogo, é removido no clear).

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/ecs/System.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L80)

Predicado opcional de PAUSA: se definido e retornar `true` num tick, o
`World` pula o `update` deste sistema nesse frame. Usado, por ex., pra pausar
a gameplay (física/input) enquanto o editor está ativo
(`pauseWhen = () => game.editorActive`).

#### Returns

`boolean`

***

### priority

> **priority**: `number` = `0`

Defined in: [src/ecs/System.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L43)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

***

### profileLabel?

> `readonly` `optional` **profileLabel?**: `string`

Defined in: [src/ecs/System.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L58)

Nome do sistema no perfil por sistema (`World.enableSystemProfile`, SPEC-0236).
Sem ele o perfil usa `constructor.name`, que no bundle minificado vira `fx`,
`DBe`… — por isso todo sistema da engine declara o seu (SPEC-0671).

***

### requiredComponents

> `static` **requiredComponents**: `ComponentClass`[] = `[]`

Defined in: [src/ecs/System.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L72)

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

Defined in: [src/ecs/System.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L100)

Libera recursos ao remover o sistema — chamado por [World.clear](World.md#clear) (e
pode ser chamado manualmente). No-op por padrão; sobrescreva pra liberar
handles nativos que o GC não coleta sozinho (ex.: o mundo do Rapier em
[RapierPhysicsSystem](RapierPhysicsSystem.md)). Essencial pra trocar de cena/fase sem vazar.

#### Returns

`void`

***

### update()

> `abstract` **update**(`entities`, `deltaTime`): `void`

Defined in: [src/ecs/System.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L92)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`. O array é
                   compartilhado com outros sistemas e reaproveitado entre
                   quadros enquanto a estrutura do ECS não muda (ADR-0676):
                   leia, guarde a referência se quiser, mas **não mute**.

##### deltaTime

`number`

Tempo decorrido desde o último tick, em segundos.

#### Returns

`void`
