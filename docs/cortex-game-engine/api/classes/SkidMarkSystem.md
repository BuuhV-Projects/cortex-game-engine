[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SkidMarkSystem

# Class: SkidMarkSystem

Defined in: [src/systems/SkidMarkSystem.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L52)

Desenha **marcas de pneu** no chão quando o carro derrapa ou freia forte (ADR-0081).
Lê o contato das rodas do [Vehicle](Vehicle.md) (no WASM) e acumula segmentos numa única
malha (ring buffer — os mais antigos são reciclados). Nativo e **configurável via
projeto** (cor, largura, limiar, freio-de-mão). `priority = 31` (DEPOIS do
`VehicleControlSystem`, que faz o `physics.step()` — contatos já atualizados).

## Example

```ts
new SkidMarkSystem(vehicle, scene.getThreeScene(), {
  active: () => car.driving,
  skidding: () => brakeInput > 0.6,  // freio forte deixa marca
})
```

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new SkidMarkSystem**(`vehicle`, `root`, `options?`): `SkidMarkSystem`

Defined in: [src/systems/SkidMarkSystem.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L64)

#### Parameters

##### vehicle

[`Vehicle`](Vehicle.md)

##### root

`Object3D`

##### options?

[`SkidMarkOptions`](../interfaces/SkidMarkOptions.md) = `{}`

#### Returns

`SkidMarkSystem`

#### Overrides

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

> **priority**: `number` = `31`

Defined in: [src/systems/SkidMarkSystem.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L54)

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: `never`[] = `[]`

Defined in: [src/systems/SkidMarkSystem.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L53)

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

### clear()

> **clear**(): `void`

Defined in: [src/systems/SkidMarkSystem.ts:151](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L151)

Apaga todas as marcas.

#### Returns

`void`

***

### update()

> **update**(`_entities`, `_deltaTime`): `void`

Defined in: [src/systems/SkidMarkSystem.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/SkidMarkSystem.ts#L106)

Executa a lógica do sistema para o frame/passo atual.

#### Parameters

##### \_entities

[`Entity`](Entity.md)[]

##### \_deltaTime

`number`

#### Returns

`void`

#### Overrides

[`System`](System.md).[`update`](System.md#update)
