[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / World

# Class: World

Defined in: [jge-present/src/ecs/World.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L39)

Registro central do sistema ECS — vide ADR-0002.

O `World` gerencia o ciclo de vida de entities e systems:
- **Entities**: criadas e destruídas via `createEntity` / `destroyEntity`.
- **Systems**: registrados via `addSystem` e removidos via `removeSystem`.
  São armazenados em ordem crescente de `priority`.
- **Query**: `query(...ComponentClasses)` retorna as entities que possuem
  *todos* os componentes especificados.
- **Tick**: `tick(deltaTime)` itera os systems em ordem de prioridade;
  cada system recebe apenas as entities que satisfazem seus
  `requiredComponents`.

## Example

```ts
const world = new World();
const player = world.createEntity();
player.addComponent(new TransformComponent());
player.addComponent(new VelocityComponent());

world.addSystem(new MovementSystem());
world.tick(16); // executa um frame de 16 ms
```

## Constructors

### Constructor

> **new World**(): `World`

#### Returns

`World`

## Methods

### addSystem()

> **addSystem**(`system`): `void`

Defined in: [jge-present/src/ecs/World.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L85)

Adiciona um system ao world.

A lista interna é reordenada por `priority` crescente após cada inserção,
garantindo que `tick` execute os systems na ordem correta sem custo extra
por frame.

#### Parameters

##### system

[`System`](System.md)

Instância do system a registrar.

#### Returns

`void`

***

### clear()

> **clear**(): `void`

Defined in: [jge-present/src/ecs/World.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L114)

Esvazia o world pra trocar de fase/cena: remove entities e systems, chamando
`dispose()` nos systems removidos (libera handles nativos, ex.: mundo do
Rapier). PRESERVA os marcados `keepOnClear` — overlays que sobrevivem à
troca (ex.: os sistemas + o alvo do editor F2). Depois re-registre os
systems da próxima cena.

O objeto `World` continua o MESMO (só é esvaziado), então referências a
`game.world` seguem válidas.

#### Returns

`void`

***

### createEntity()

> **createEntity**(): [`Entity`](Entity.md)

Defined in: [jge-present/src/ecs/World.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L58)

Cria uma nova entity, registra-a no world e a retorna.

#### Returns

[`Entity`](Entity.md)

A entity recém-criada com UUID único.

***

### destroyEntity()

> **destroyEntity**(`entity`): `void`

Defined in: [jge-present/src/ecs/World.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L70)

Remove a entity do world.
Sem efeito se a entity não pertencer a este world.

#### Parameters

##### entity

[`Entity`](Entity.md)

A entity a ser destruída.

#### Returns

`void`

***

### enableSystemProfile()

> **enableSystemProfile**(): `Map`\<`string`, `number`\>

Defined in: [jge-present/src/ecs/World.ts:201](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L201)

Liga o perfil por sistema e devolve o mapa vivo (nome → ms acumulados).
Desligado por default: cronometrar todo sistema todo frame é instrumento,
não comportamento de produção.

#### Returns

`Map`\<`string`, `number`\>

***

### hasSystem()

> **hasSystem**(`SystemClass`): `boolean`

Defined in: [jge-present/src/ecs/World.ts:133](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L133)

`true` se já existe um system registrado da classe `SystemClass`. Útil para
registrar um system **sob demanda só uma vez** (ex.: o `buildScene` liga o
`SpriteAnimationSystem` quando a cena tem sprites animados, sem duplicar).

#### Parameters

##### SystemClass

`SystemClass`

Construtor da classe do system a procurar.

#### Returns

`boolean`

***

### query()

> **query**\<`T`\>(...`componentClasses`): [`Entity`](Entity.md)[]

Defined in: [jge-present/src/ecs/World.ts:150](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L150)

Retorna todas as entities que possuem **todos** os componentes especificados.

Sem argumentos, retorna todas as entities ativas no world.

#### Type Parameters

##### T

`T` *extends* [`Component`](Component.md)

#### Parameters

##### componentClasses

...`ComponentClass`\<`T`\>[]

Classes de componentes que a entity deve possuir.

#### Returns

[`Entity`](Entity.md)[]

Array de entities que satisfazem todos os critérios.

#### Example

```ts
const moving = world.query(TransformComponent, VelocityComponent);
```

***

### removeSystem()

> **removeSystem**(`SystemClass`): `void`

Defined in: [jge-present/src/ecs/World.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L96)

Remove o primeiro system cuja classe corresponda a `SystemClass`.
Sem efeito se nenhum system do tipo especificado estiver registrado.

#### Parameters

##### SystemClass

`SystemClass`

Construtor da classe do system a remover.

#### Returns

`void`

***

### resetSystemProfile()

> **resetSystemProfile**(): `void`

Defined in: [jge-present/src/ecs/World.ts:207](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L207)

Zera os acumuladores do perfil por sistema, mantendo-o ligado.

#### Returns

`void`

***

### tick()

> **tick**(`deltaTime`): `void`

Defined in: [jge-present/src/ecs/World.ts:176](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/World.ts#L176)

Executa um passo de simulação, iterando todos os systems em ordem de
prioridade crescente.

Para cada system, o `World`:
1. Obtém `requiredComponents` declarado estaticamente na classe do system.
2. Chama `query(...requiredComponents)` para filtrar as entities elegíveis.
3. Repassa as entities filtradas ao `system.update(entities, deltaTime)`.

Chamado pelo `GameLoop` a cada frame (passo variável) ou passo fixo de
física — vide ADR-0002.

#### Parameters

##### deltaTime

`number`

Tempo decorrido desde o último tick, em ms.

#### Returns

`void`
