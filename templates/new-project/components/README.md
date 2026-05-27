# components/

Cada arquivo aqui exporta **uma** classe que estende `Component` do
`cortex-game-engine`. Componentes são **só dados** — campos públicos,
sem métodos que mutem outras entities. Lógica vai em `../systems/`.

## Exemplo

```ts
// PositionComponent.ts
import { Component } from 'cortex-game-engine'

export class PositionComponent extends Component {
  constructor(public x = 0, public y = 0, public z = 0) {
    super()
  }
}
```

## Bons candidatos a Component

- Dados de transform: `PositionComponent`, `RotationComponent`, `VelocityComponent`
- Estado de gameplay: `HealthComponent`, `ScoreComponent`, `LifetimeComponent`
- Referência a objetos 3D: `MeshComponent` (guarda a Mesh)
- Marcadores (sem campos): `PlayerComponent`, `EnemyComponent`,
  `CoinComponent` — usados como filtro em queries

## Anti-padrões

- ❌ Métodos que tocam outras entities ou cena
- ❌ Herança entre Components (`class FlyingEnemyComponent extends EnemyComponent`).
  Use composição: entidade tem `EnemyComponent` + `FlyingComponent`.
- ❌ Estado derivado caro (cache de cálculo) — recalcule no System.
