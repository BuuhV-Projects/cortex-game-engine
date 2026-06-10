[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CharacterGroundSystem

# Class: CharacterGroundSystem

Defined in: src/systems/CharacterGroundSystem.ts:22

**Chão por raycast** pra o [CharacterBodyComponent](CharacterBodyComponent.md) — o personagem manda um
raio pra BAIXO e fica EM CIMA do primeiro mesh abaixo dele (terreno, tiles
hexagonais, plataformas, qualquer geometria). Assim o chão é o próprio mesh, sem
precisar marcar collider em cada objeto (modelo estilo UPBGE). `stepHeight`
permite subir degraus pequenos andando. Aterra (zera `velocityY`, marca
`grounded`, reseta pulos).

Precisa das **raízes da cena** pra testar (`new CharacterGroundSystem([scene]))`;
ignora o próprio mesh do personagem. Roda depois da física (priority 7).

## Extends

- [`System`](System.md)

## Constructors

### Constructor

> **new CharacterGroundSystem**(`roots`): `CharacterGroundSystem`

Defined in: src/systems/CharacterGroundSystem.ts:27

#### Parameters

##### roots

`Object3D`\<`Object3DEventMap`\>[]

#### Returns

`CharacterGroundSystem`

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

> **priority**: `number` = `7`

Defined in: src/systems/CharacterGroundSystem.ts:24

Prioridade de execução deste sistema.

O `World` ordena os sistemas por valor crescente antes de iterar no tick.
Sistemas com valores menores executam antes. Padrão: `0`.

#### Overrides

[`System`](System.md).[`priority`](System.md#priority)

***

### requiredComponents

> `static` **requiredComponents**: (*typeof* [`TransformComponent`](TransformComponent.md) \| *typeof* [`CharacterBodyComponent`](CharacterBodyComponent.md))[]

Defined in: src/systems/CharacterGroundSystem.ts:23

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

### update()

> **update**(`entities`): `void`

Defined in: src/systems/CharacterGroundSystem.ts:31

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
