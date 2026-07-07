[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TerrainCollisionSystem

# Class: TerrainCollisionSystem

Defined in: [src/systems/TerrainCollisionSystem.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TerrainCollisionSystem.ts#L29)

**Colisão com o terreno** (heightmap) — mantém os corpos EM CIMA da superfície:
se um corpo cai abaixo da altura do terreno no seu `(x, z)`, é subido até a
superfície e **aterrado** (zera a velocidade pra baixo, marca `grounded`). Vale
pra `PlatformerBodyComponent` (2.5D) e `KinematicBodyComponent` (genérico) —
então serve pra jogos 3D, 2.5D ou top-down (a altura vem de [Terrain.heightAt](Terrain.md#heightat)).
Terreno é **sólido por padrão**: o [buildScene](../functions/buildScene.md) liga este sistema quando a
cena tem terreno.

⚠️ **NÃO** trata `CharacterBodyComponent`: o personagem (cápsula) já aterra no
terreno pelo **raycast** do `CharacterPhysicsSystem` (que mira a malha real da
cena, terreno incluso). Ter os dois aterrando o mesmo corpo fazia ele **quicar**
em rampas — o raycast pousa no triângulo da malha e o `heightAt` é bilinear, então
as alturas divergem e brigavam a cada frame. Uma autoridade só (o raycast).

Roda **depois da física** (priority 5) e **antes do** `Object3DSyncSystem`
(priority 10), pra a mesh refletir a posição já corrigida.

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new TerrainCollisionSystem**(): `TerrainCollisionSystem`

#### Returns

`TerrainCollisionSystem`

#### Inherited from

[`System`](System.md).[`constructor`](System.md#constructor)

## Properties

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/ecs/System.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L65)

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

> **priority**: `number` = `7`

Defined in: [src/systems/TerrainCollisionSystem.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TerrainCollisionSystem.ts#L31)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: `never`[] = `[]`

Defined in: [src/systems/TerrainCollisionSystem.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TerrainCollisionSystem.ts#L30)

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

Defined in: [src/ecs/System.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L82)

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

Defined in: [src/systems/TerrainCollisionSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TerrainCollisionSystem.ts#L33)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### entities

[`Entity`](Entity.md)[]

Entidades filtradas pelo `World` que possuem todos os
                   componentes declarados em `requiredComponents`.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
