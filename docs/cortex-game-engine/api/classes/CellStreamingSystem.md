[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CellStreamingSystem

# Class: CellStreamingSystem

Defined in: src/scene/Streaming.ts:63

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

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new CellStreamingSystem**(`cells`, `opts`): `CellStreamingSystem`

Defined in: src/scene/Streaming.ts:72

#### Parameters

##### cells

[`StreamingCell`](../interfaces/StreamingCell.md)[]

##### opts

[`CellStreamingOptions`](../interfaces/CellStreamingOptions.md)

#### Returns

`CellStreamingSystem`

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

> **priority**: `number` = `-1000`

Defined in: src/scene/Streaming.ts:65

Roda ANTES de tudo — o render vê a residência já atualizada neste frame.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: `ComponentClass`[] = `[]`

Defined in: [src/ecs/System.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L65)

Construtores dos componentes que este sistema requer.

O `World` usa essa lista para filtrar as entidades antes de chamar `update`,
garantindo que apenas entidades com todos os componentes declarados sejam
repassadas ao sistema.

Subclasses devem sobrescrever este campo estático.

#### Example

```ts
static requiredComponents = [TransformComponent, VelocityComponent];
```

#### Inherited from

[`System`](System.md).[`requiredComponents`](System.md#requiredcomponents)

## Accessors

### resident

#### Get Signature

> **get** **resident**(): `ReadonlySet`\<`string`\>

Defined in: src/scene/Streaming.ts:119

Chaves residentes agora.

##### Returns

`ReadonlySet`\<`string`\>

***

### residentCount

#### Get Signature

> **get** **residentCount**(): `number`

Defined in: src/scene/Streaming.ts:124

Nº de células residentes agora.

##### Returns

`number`

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

### step()

> **step**(`cam`): `void`

Defined in: src/scene/Streaming.ts:91

Passo puro do streaming (testável): descarrega o que saiu de `raio+histerese`
e carrega, por distância e até o orçamento, o que entrou no raio.

#### Parameters

##### cam

[`Vec2XZ`](../interfaces/Vec2XZ.md)

#### Returns

`void`

***

### update()

> **update**(): `void`

Defined in: src/scene/Streaming.ts:83

Executa a lógica do sistema para o frame/passo atual.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
