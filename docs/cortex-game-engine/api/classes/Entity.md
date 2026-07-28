[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Entity

# Class: Entity

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L20)

Entidade do sistema ECS.

Wrapper em torno de um UUID único que agrega componentes indexados pelo nome
da classe construtora. Vide ADR-0002.

## Example

```ts
const entity = new Entity();
entity.addComponent(new TransformComponent());
const t = entity.getComponent(TransformComponent);
```

## Constructors

### Constructor

> **new Entity**(): `Entity`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L33)

#### Returns

`Entity`

## Properties

### id

> `readonly` **id**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L22)

Identificador único gerado via `crypto.randomUUID()`.

***

### keepOnClear

> **keepOnClear**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L29)

Se `true`, `World.clear()` PRESERVA esta entidade (não a remove ao
trocar de cena). Usado por overlays que sobrevivem à troca de fase — ex.: o
"alvo" invisível do editor F2. Por padrão `false` (entidade da cena, morre).

## Methods

### addComponent()

> **addComponent**(`component`): `this`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L45)

Adiciona um componente à entidade.
Se já existir um componente do mesmo tipo, ele é substituído.

#### Parameters

##### component

[`Component`](Component.md)

#### Returns

`this`

`this` para permitir encadeamento (method chaining).

***

### getAllComponents()

> **getAllComponents**(): [`Component`](Component.md)[]

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L80)

Retorna todos os componentes da entidade como array.
A ordem reflete a ordem de inserção no Map.

#### Returns

[`Component`](Component.md)[]

***

### getComponent()

> **getComponent**\<`T`\>(`ComponentClass`): `T` \| `undefined`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L65)

Retorna o componente do tipo especificado, ou `undefined` se ausente.

#### Type Parameters

##### T

`T` *extends* [`Component`](Component.md)

#### Parameters

##### ComponentClass

`ComponentClass`\<`T`\>

#### Returns

`T` \| `undefined`

#### Example

```ts
const t = entity.getComponent(TransformComponent);
if (t) { t.position.x = 10; }
```

***

### hasComponent()

> **hasComponent**\<`T`\>(`ComponentClass`): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L72)

Verifica se a entidade possui um componente do tipo especificado.

#### Type Parameters

##### T

`T` *extends* [`Component`](Component.md)

#### Parameters

##### ComponentClass

`ComponentClass`\<`T`\>

#### Returns

`boolean`

***

### removeComponent()

> **removeComponent**\<`T`\>(`ComponentClass`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ecs/Entity.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Entity.ts#L54)

Remove o componente do tipo especificado.
Sem efeito se o componente não estiver presente.

#### Type Parameters

##### T

`T` *extends* [`Component`](Component.md)

#### Parameters

##### ComponentClass

`ComponentClass`\<`T`\>

#### Returns

`void`
