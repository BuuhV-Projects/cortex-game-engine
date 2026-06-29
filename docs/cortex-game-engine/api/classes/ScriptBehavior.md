[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ScriptBehavior

# Abstract Class: ScriptBehavior

Defined in: src/scripts/ScriptBehavior.ts:53

**Base de comportamento anexável a um objeto** (estilo MonoBehaviour da Unity) — ADR-0085.

Você escreve uma subclasse, declara campos editáveis em `static fields`, e a anexa a um
nó pelo Inspector ("Adicionar Componente → Script") ou pelo `level.json`
(`node.scripts`). O [ScriptHostSystem](ScriptHostSystem.md) instancia, injeta `entity`/`object3d`/`ctx`,
aplica os valores dos campos e chama os hooks. **Roda só no Play** (pausa no editor).

## Example

```ts
class Girar extends ScriptBehavior {
  static fields = { rpm: { type: 'number', default: 30, label: 'Rotação (rpm)' } } as const;
  rpm = 30;
  onUpdate(dt: number) { if (this.object3d) this.object3d.rotation.y += (this.rpm / 60) * Math.PI * 2 * dt; }
}
registerScript('Girar', Girar);
```

## Constructors

### Constructor

> **new ScriptBehavior**(): `ScriptBehavior`

#### Returns

`ScriptBehavior`

## Properties

### ctx

> **ctx**: [`ScriptContext`](../interfaces/ScriptContext.md)

Defined in: src/scripts/ScriptBehavior.ts:59

Handles do engine (world, input, gamepad, scene, camera). Injetado.

***

### entity

> **entity**: [`Entity`](Entity.md)

Defined in: src/scripts/ScriptBehavior.ts:55

A entidade ECS que hospeda este script (injetada).

***

### object3d

> **object3d**: `Object3D`\<`Object3DEventMap`\> \| `null` = `null`

Defined in: src/scripts/ScriptBehavior.ts:57

O `Object3D` do nó ao qual o script está anexado (ou `null`). Injetado.

***

### fields?

> `static` `optional` **fields?**: [`ScriptFieldSchema`](../type-aliases/ScriptFieldSchema.md)

Defined in: src/scripts/ScriptBehavior.ts:69

Schema dos campos editáveis no Inspector — declare como `static fields` na subclasse.

## Methods

### onDestroy()?

> `optional` **onDestroy**(): `void`

Defined in: src/scripts/ScriptBehavior.ts:66

Chamado ao remover o script (Inspector) ou destruir a entidade.

#### Returns

`void`

***

### onStart()?

> `optional` **onStart**(): `void`

Defined in: src/scripts/ScriptBehavior.ts:62

Chamado UMA vez, no primeiro frame de Play após o script existir.

#### Returns

`void`

***

### onUpdate()?

> `optional` **onUpdate**(`dt`): `void`

Defined in: src/scripts/ScriptBehavior.ts:64

Chamado todo frame de Play. `dt` em **segundos**.

#### Parameters

##### dt

`number`

#### Returns

`void`
