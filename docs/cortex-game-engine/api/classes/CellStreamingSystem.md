[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CellStreamingSystem

# Class: CellStreamingSystem

Defined in: [src/scene/Streaming.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L72)

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

Defined in: [src/scene/Streaming.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L85)

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

Defined in: [src/ecs/System.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L80)

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

Defined in: [src/scene/Streaming.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L75)

Roda ANTES de tudo — o render vê a residência já atualizada neste frame.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### profileLabel

> `readonly` **profileLabel**: `"CellStreamingSystem"` = `'CellStreamingSystem'`

Defined in: [src/scene/Streaming.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L73)

Nome do sistema no perfil por sistema (`World.enableSystemProfile`, SPEC-0236).
Sem ele o perfil usa `constructor.name`, que no bundle minificado vira `fx`,
`DBe`… — por isso todo sistema da engine declara o seu (SPEC-0671).

#### Overrides

[`System`](System.md).[`profileLabel`](System.md#profilelabel)

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

#### Inherited from

[`System`](System.md).[`requiredComponents`](System.md#requiredcomponents)

## Accessors

### loadingCount

#### Get Signature

> **get** **loadingCount**(): `number`

Defined in: [src/scene/Streaming.ts:168](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L168)

Nº de células ainda CARREGANDO (onLoad async não terminou) — pra tela de loading.

##### Returns

`number`

***

### resident

#### Get Signature

> **get** **resident**(): `ReadonlySet`\<`string`\>

Defined in: [src/scene/Streaming.ts:153](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L153)

Chaves residentes agora (desejadas — inclui as ainda carregando).

##### Returns

`ReadonlySet`\<`string`\>

***

### residentCount

#### Get Signature

> **get** **residentCount**(): `number`

Defined in: [src/scene/Streaming.ts:163](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L163)

Nº de células residentes (desejadas) agora.

##### Returns

`number`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/ecs/System.ts:97](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L97)

Libera recursos ao remover o sistema — chamado por [World.clear](World.md#clear) (e
pode ser chamado manualmente). No-op por padrão; sobrescreva pra liberar
handles nativos que o GC não coleta sozinho (ex.: o mundo do Rapier em
[RapierPhysicsSystem](RapierPhysicsSystem.md)). Essencial pra trocar de cena/fase sem vazar.

#### Returns

`void`

#### Inherited from

[`System`](System.md).[`dispose`](System.md#dispose)

***

### isResident()

> **isResident**(`key`): `boolean`

Defined in: [src/scene/Streaming.ts:158](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L158)

A célula `key` é desejada agora? (o app confere antes de adicionar à cena.)

#### Parameters

##### key

`string`

#### Returns

`boolean`

***

### step()

> **step**(`cam`): `void`

Defined in: [src/scene/Streaming.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L104)

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

Defined in: [src/scene/Streaming.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Streaming.ts#L96)

Executa a lógica do sistema para o frame/passo atual.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
