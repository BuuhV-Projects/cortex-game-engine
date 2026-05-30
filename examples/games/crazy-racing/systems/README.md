# systems/

Cada arquivo exporta **uma** classe que estende `System` do
`cortex-game-engine`. Systems contêm **toda a lógica** que opera sobre
Components. Sem estado interno — estado vive em Components.

## Exemplo

```ts
// MovementSystem.ts
import { System, type Entity } from 'cortex-game-engine'
import { PositionComponent } from '../components/PositionComponent'
import { VelocityComponent } from '../components/VelocityComponent'

export class MovementSystem extends System {
  static override requiredComponents = [PositionComponent, VelocityComponent]

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000  // engine entrega ms
    for (const entity of entities) {
      const pos = entity.getComponent(PositionComponent)!
      const vel = entity.getComponent(VelocityComponent)!
      pos.x += vel.vx * dt
      pos.y += vel.vy * dt
      pos.z += vel.vz * dt
    }
  }
}
```

## Padrão

- `static requiredComponents = [...]` declara o filtro — só entidades
  com **todos** esses components chegam no `update`.
- `priority` (numérico) controla ordem de execução; default 0.
- `update(entities, deltaTime)` recebe ms — converta para segundos se
  estiver trabalhando em unidades/segundo.

## Anti-padrões

- ❌ Estado interno mutável (`this.timer`, `this.lastInput`). Mova
  para um Component (ex.: `TimerComponent`).
- ❌ Tocar diretamente em Components de tipos não declarados em
  `requiredComponents`. Se precisa de outro, declare.
- ❌ Importar `three` direto pra criar Meshes — use a factory em
  `../entities/`.
