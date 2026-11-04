[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleArcadeSystem

# Class: VehicleArcadeSystem

Defined in: [src/systems/VehicleArcadeSystem.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleArcadeSystem.ts#L35)

Avança VÁRIOS carros no mesmo mundo Rapier (ADR-0256 / SPEC-0259).

O `VehicleControlSystem` supõe um carro e avança o mundo sozinho; com seis, os
da IA davam `vehicle.update` fora do passo do mundo. Aqui o mundo anda UMA vez
por passo, e cada carro faz aderência + `update` dentro dele.

Prioridade 8 (o slot da física): pilotos — input do jogador (30) e scripts de
IA (50) — escrevem forças que valem no passo do frame seguinte, com o mesmo
atraso para todos; a câmera (30) vê a pose recém-calculada.

Carro parado (sem motor, sem velocidade, rodas no chão por `REST_STEPS`
subpassos) DORME e sai da simulação até algo acordá-lo; chassi cinemático
só recebe a pose na malha (SPEC-0655). Carro com `poseOwner = 'external'`
(SPEC-0687) fica de fora de tudo: quem marcou escreve a malha.

Não combine com `RapierPhysicsSystem` no mesmo `RapierPhysics` (os dois
avançam o mundo), e passe `stepPhysics: false` ao `VehicleControlSystem` do
jogador.

## Example

```ts
world.addSystem(new VehicleArcadeSystem(physics));
```

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new VehicleArcadeSystem**(`physics`): `VehicleArcadeSystem`

Defined in: [src/systems/VehicleArcadeSystem.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleArcadeSystem.ts#L64)

#### Parameters

##### physics

[`RapierPhysics`](RapierPhysics.md)

#### Returns

`VehicleArcadeSystem`

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

> **priority**: `number` = `8`

Defined in: [src/systems/VehicleArcadeSystem.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleArcadeSystem.ts#L38)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### profileLabel

> `readonly` **profileLabel**: `"VehicleArcadeSystem"` = `'VehicleArcadeSystem'`

Defined in: [src/systems/VehicleArcadeSystem.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleArcadeSystem.ts#L36)

Nome do sistema no perfil por sistema (`World.enableSystemProfile`, SPEC-0236).
Sem ele o perfil usa `constructor.name`, que no bundle minificado vira `fx`,
`DBe`… — por isso todo sistema da engine declara o seu (SPEC-0671).

#### Overrides

[`System`](System.md).[`profileLabel`](System.md#profilelabel)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`Object3DComponent`](Object3DComponent.md) \| *typeof* [`ArcadeVehicleComponent`](ArcadeVehicleComponent.md))[]

Defined in: [src/systems/VehicleArcadeSystem.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleArcadeSystem.ts#L37)

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

Defined in: [src/ecs/System.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/System.ts#L100)

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

Defined in: [src/systems/VehicleArcadeSystem.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleArcadeSystem.ts#L68)

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

#### Overrides

[`System`](System.md).[`update`](System.md#update)
