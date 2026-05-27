# {{PROJECT_NAME}}

Projeto criado com `cortex-game-engine` — motor de jogos 3D em TypeScript
com arquitetura ECS (Entity-Component-System).

## Estrutura

```
.
├── components/   Só dados — classes que estendem Component
├── systems/      Só lógica — classes que estendem System
├── entities/     Factories — funções que montam entities com Components
├── scenes/       Setup de cena/level (cria entities, registra systems)
├── assets/       .glb, .gltf, texturas, sons (não TypeScript)
├── utils/        Helpers genéricos do projeto
├── main.ts       Bootstrap: World + GameLoop + Renderer + cena inicial
├── index.html
└── vendor/cortex-game-engine/  Motor vendoriado
```

Cada pasta tem seu próprio `README.md` com convenções específicas e
exemplos. Quando crescer, agrupar por feature (`features/player/`,
`features/enemies/`) pode fazer sentido — mas pra começar, separação
por categoria é mais simples.

## Regras importantes

1. **Component só com dados** — campos públicos, sem métodos que mutam
   outras entities. Lógica vai em System.
2. **System sem estado interno** — estado pertence a Components.
3. **Composição > herança em Components** — "Inimigo voador" =
   `EnemyComponent` + `FlyingComponent`, não `class FlyingEnemy`.
4. **Não importar `three` direto** — use exports do
   `cortex-game-engine`. Se faltar algo, pedir pra estender o motor.
5. **Um arquivo por classe** — `PositionComponent.ts` exporta apenas
   `PositionComponent`.

## Rodar

```bash
yarn install   # primeira vez
yarn dev       # sobe vite com hot reload
```

Ou use o botão **▶ Play** no IDE.
