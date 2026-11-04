[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PlatformerPhysicsSystem

# Class: PlatformerPhysicsSystem

Defined in: [src/systems/PlatformerPhysicsSystem.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L30)

Física de plataforma 2.5D no plano **XY**: gravidade, movimento horizontal por
intenção (`PlatformerBodyComponent.moveDir`), pulo, e **colisão AABB por eixo**
contra os sólidos. Resolve X e depois Y (estilo platformer clássico): pousa no
topo (`grounded`), bate a cabeça no teto, e bloqueia nas paredes. Plataformas
`oneWay` só colidem vindo de cima.

O AABB de cada collider é centrado em `Transform + (offsetX, offsetY)` — o
offset permite collider acoplado ao mesh mas cobrindo uma sub-região (deck,
pivô descentralizado). Offset `0` = centrado no Transform.

**Resolução X por menor penetração:** o X só bloqueia ("parede") quando a
penetração horizontal é a MENOR — senão é "pousar/teto" e fica pro passo Y.
Sem isso, um collider sólido em que o player está em pé dispara um falso
"encostou na parede" no frame da gravidade (player afunda ~0.01u no topo) e o
player é teleportado pra borda. Com a regra de menor penetração, **colliders
sólidos são andáveis** (não precisam ser `oneWay` só pra evitar o trap).

Recebe TODAS as entidades com `Transform` + `Collider` (atores E sólidos);
separa internamente quem tem `PlatformerBodyComponent` (ator). Roda antes do
`Object3DSyncSystem` (priority 10), pra a mesh refletir a posição resolvida.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new PlatformerPhysicsSystem**(): `PlatformerPhysicsSystem`

#### Returns

`PlatformerPhysicsSystem`

#### Inherited from

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

> **priority**: `number` = `5`

Defined in: [src/systems/PlatformerPhysicsSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L33)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### profileLabel

> `readonly` **profileLabel**: `"PlatformerPhysicsSystem"` = `'PlatformerPhysicsSystem'`

Defined in: [src/systems/PlatformerPhysicsSystem.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L31)

Nome do sistema no perfil por sistema (`World.enableSystemProfile`, SPEC-0236).
Sem ele o perfil usa `constructor.name`, que no bundle minificado vira `fx`,
`DBe`… — por isso todo sistema da engine declara o seu (SPEC-0671).

#### Overrides

[`System`](System.md).[`profileLabel`](System.md#profilelabel)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`Collider2DComponent`](Collider2DComponent.md) \| *typeof* [`TransformComponent`](TransformComponent.md))[]

Defined in: [src/systems/PlatformerPhysicsSystem.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L32)

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

Defined in: [src/ecs/System.ts:99](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L99)

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

Defined in: [src/systems/PlatformerPhysicsSystem.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/PlatformerPhysicsSystem.ts#L35)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`.
                   **Só leitura**: o `World` reusa o mesmo array entre
                   quadros enquanto a estrutura do ECS não muda (SPEC-0673).

##### deltaTime

`number`

Tempo decorrido desde o último tick, em segundos.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
