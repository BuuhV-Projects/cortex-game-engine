[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleControlSystem

# Class: VehicleControlSystem

Defined in: [src/systems/VehicleControlSystem.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L91)

Dirige um [Vehicle](Vehicle.md) do Rapier (ADR-0081), gamepad-first com **fallback
teclado**: com controle, **RT** acelera, **LT** freia (e dá ré parado), **stick X**
esterça; SEM controle (`gamepad.isConnected(0) === false`), **W/↑** acelera, **S/↓**
freia/ré, **A·D / ←·→** esterça. Roda `vehicle.update(dt)` e o `physics.step()`
(DEPOIS — convenção do Rapier), sincroniza a malha do carro ao chassi e posiciona a
**chase cam**. `priority = 30` (DEPOIS da câmera de 3ª pessoa, que é 20 — senão ela
sobrescreveria a chase cam ao dirigir). As rodas raycastam no WASM (sem custo de CPU).

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new VehicleControlSystem**(`physics`, `vehicle`, `car`, `camera`, `gamepad`, `input?`, `options?`): `VehicleControlSystem`

Defined in: [src/systems/VehicleControlSystem.ts:103](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L103)

#### Parameters

##### physics

[`RapierPhysics`](RapierPhysics.md)

##### vehicle

[`Vehicle`](Vehicle.md)

##### car

`Object3D`

##### camera

`PerspectiveCamera`

##### gamepad

[`GamepadManager`](GamepadManager.md)

##### input?

[`InputManager`](InputManager.md)

Teclado (fallback quando não há controle). Opcional.

##### options?

[`VehicleControlOptions`](../interfaces/VehicleControlOptions.md) = `{}`

#### Returns

`VehicleControlSystem`

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

> **priority**: `number` = `30`

Defined in: [src/systems/VehicleControlSystem.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L93)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: `never`[] = `[]`

Defined in: [src/systems/VehicleControlSystem.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L92)

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

### update()

> **update**(`_entities`, `deltaTime`): `void`

Defined in: [src/systems/VehicleControlSystem.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L117)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### \_entities

[`Entity`](Entity.md)[]

##### deltaTime

`number`

Tempo decorrido desde o último tick, em segundos.

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
