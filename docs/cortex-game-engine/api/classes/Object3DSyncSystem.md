[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Object3DSyncSystem

# Class: Object3DSyncSystem

Defined in: [src/systems/Object3DSyncSystem.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L23)

Sincroniza `TransformComponent` → `Object3D.position` / `rotation.y`.

Roda depois da movimentação/física (priority 10) pra garantir que o frame
renderizado reflita o estado lógico atualizado.

Garante `rotation.order = 'YXZ'`: assim o yaw (`rotation.y`) é aplicado
primeiro e pitch/roll (`rotation.x`/`.z`) — que outros sistemas (ex.:
conformação ao terreno do jogo) aplicam direto no `Object3D` — ficam "locais"
à entidade já virada. Corrige a ordem se algo a trocou.

Só escreve o que difere do transform (SPEC-0673): cada setter de `Euler`
recalcula o quaternion (`sin`/`cos`), e a maioria das entidades (colisores
estáticos, carros dormindo) não se move. O resultado é o mesmo de escrever
sempre — inclusive para quem escreve direto em `transform.x` ou no `Object3D`.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new Object3DSyncSystem**(): `Object3DSyncSystem`

#### Returns

`Object3DSyncSystem`

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

> **priority**: `number` = `10`

Defined in: [src/systems/Object3DSyncSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L26)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### profileLabel

> `readonly` **profileLabel**: `"Object3DSyncSystem"` = `'Object3DSyncSystem'`

Defined in: [src/systems/Object3DSyncSystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L24)

Nome do sistema no perfil por sistema (`World.enableSystemProfile`, SPEC-0236).
Sem ele o perfil usa `constructor.name`, que no bundle minificado vira `fx`,
`DBe`… — por isso todo sistema da engine declara o seu (SPEC-0671).

#### Overrides

[`System`](System.md).[`profileLabel`](System.md#profilelabel)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`Object3DComponent`](Object3DComponent.md) \| *typeof* [`TransformComponent`](TransformComponent.md))[]

Defined in: [src/systems/Object3DSyncSystem.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L25)

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

> **update**(`entities`): `void`

Defined in: [src/systems/Object3DSyncSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/Object3DSyncSystem.ts#L33)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`.
                   **Só leitura**: o `World` reusa o mesmo array entre
                   quadros enquanto a estrutura do ECS não muda (SPEC-0673).

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
