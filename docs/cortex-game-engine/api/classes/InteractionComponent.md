[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InteractionComponent

# Class: InteractionComponent

Defined in: src/components/InteractionComponent.ts:23

**Ação de interação** padronizada (ADR-0080): marca um objeto como interagível —
o [InteractionSystem](InteractionSystem.md) mostra um prompt quando o player ativo chega a `range`
e dispara `onInteract` no botão. Genérico: serve pra entrar no carro, falar com
NPC, abrir porta, pegar item. A lógica concreta fica no `onInteract` (do jogo); o
engine só padroniza a detecção de proximidade + o disparo.

## Example

```ts
carEntity.addComponent(new InteractionComponent({ prompt: 'Entrar', range: 3.5, onInteract: () => enterCar() }))
```

## Extends

- [`Component`](Component.md)

## Constructors

### Constructor

> **new InteractionComponent**(`options?`): `InteractionComponent`

Defined in: src/components/InteractionComponent.ts:28

#### Parameters

##### options?

[`InteractionOptions`](../interfaces/InteractionOptions.md) = `{}`

#### Returns

`InteractionComponent`

#### Overrides

[`Component`](Component.md).[`constructor`](Component.md#constructor)

## Properties

### enabled

> **enabled**: `boolean` = `true`

Defined in: [src/ecs/Component.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L9)

Indica se o componente está ativo. Systems podem ignorar componentes desativados.

#### Inherited from

[`Component`](Component.md).[`enabled`](Component.md#enabled)

***

### onInteract

> **onInteract**: () => `void`

Defined in: src/components/InteractionComponent.ts:26

#### Returns

`void`

***

### prompt

> **prompt**: `string`

Defined in: src/components/InteractionComponent.ts:24

***

### range

> **range**: `number`

Defined in: src/components/InteractionComponent.ts:25

## Accessors

### type

#### Get Signature

> **get** **type**(): `string`

Defined in: [src/ecs/Component.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ecs/Component.ts#L16)

Identificador do tipo do componente.
Retorna o nome da classe construtora (ex: "TransformComponent").
Usado por Entity para indexar componentes no Map<string, Component>.

##### Returns

`string`

#### Inherited from

[`Component`](Component.md).[`type`](Component.md#type)
