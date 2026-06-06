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
- [`Object3DSyncSystem`](Object3DSyncSystem.md)
- [`ThirdPersonCameraSystem`](ThirdPersonCameraSystem.md)
- [`PlatformerPhysicsSystem`](PlatformerPhysicsSystem.md)
- [`PlatformerInputSystem`](PlatformerInputSystem.md)
- [`FollowCamera2DSystem`](FollowCamera2DSystem.md)

## Constructors

### Constructor

> **new System**(): `System`

#### Returns

`System`

## Properties

### priority

> **priority**: `number` = `0`

Defined in: [src/ecs/System.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L43)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

***

### requiredComponents

> `static` **requiredComponents**: `ComponentClass`[] = `[]`

Defined in: [src/ecs/System.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L57)

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

### update()

> `abstract` **update**(`entities`, `deltaTime`): `void`

Defined in: [src/ecs/System.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L66)

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
