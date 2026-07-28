[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / entityByObjectName

# Function: entityByObjectName()

> **entityByObjectName**(`world`, `name`): [`Entity`](../classes/Entity.md) \| `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/components/Object3DComponent.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/Object3DComponent.ts#L33)

**Entidade pelo NOME do objeto de cena.** O `buildScene` nomeia cada `Object3D`
com o `id` do nó (declarado no código/JSON, ou gerado — `add-…` — quando o
objeto é arrastado pro viewport no editor), então o nome é o identificador
estável de um objeto da cena. Use quando um query por componentes for ambíguo
(vários personagens/NPCs) e você precisa de UM objeto específico.

Convenção de nome: **alfanumérico, hífen e underline** (`[A-Za-z0-9_-]`),
sem espaço — ids gerados pelo editor já seguem isso.

## Parameters

### world

[`World`](../classes/World.md)

### name

`string`

## Returns

[`Entity`](../classes/Entity.md) \| `null`

## Example

```ts
// num ScriptBehavior: acha o boss entre vários characters
const boss = entityByObjectName(this.ctx.world, 'boss-1')
const t = boss?.getComponent(TransformComponent)
```
