# 0022 - Padrão arquitetural de projetos criados pelo IDE

**Data:** 2026-05-26
**Status:** aceito

## Contexto

Projetos criados pelo IDE começam com um `main.ts` único. Sem orientação,
crescem virando arquivos grandes que misturam dados (Components), lógica
(Systems) e bootstrap. A IA do chat, sem regras claras, distribui código
de qualquer jeito — às vezes inline no `main.ts`, às vezes em arquivos
arbitrários sem padrão.

Precisamos de uma estrutura comum:
- Que reflita o modelo ECS do `cortex-game-engine` (ADR-0002).
- Que oriente o agente sobre **onde** colocar cada coisa que ele cria.
- Que evite anti-padrões clássicos de ECS (Component com lógica, herança
  entre Components, System com estado).

## Decisão

**Estrutura de diretórios** (criada pelo IDE no scaffold do projeto):

```
<projeto>/
├── components/   # Só dados — classes que estendem Component
├── systems/      # Só lógica — classes que estendem System
├── entities/     # Factories — funções que montam entities com Components
├── scenes/       # Setup de cena/level (cria entities, registra systems)
├── assets/       # .glb, .gltf, texturas, sons (não TS)
├── utils/        # Helpers genéricos do projeto
├── main.ts       # Bootstrap: World + GameLoop + Renderer + cena inicial
├── index.html
├── package.json
└── vendor/cortex-game-engine/  # Engine vendoriado (ADR-0009)
```

Cada pasta de código (`components/`, `systems/`, `entities/`, `scenes/`,
`utils/`) recebe um `README.md` curto explicando o propósito e exemplos
do que vai/não vai ali.

**Regras anti-padrão** (mais importantes que aplicar SOLID estrito a ECS):

1. **Component só com dados.** Campos públicos. Sem métodos que mutem
   outras entities. Lógica vai em System.
2. **System sem estado interno.** Estado vai em Components. System opera
   sobre `entities` recebidas no `update`.
3. **Composição > herança em Components.** "Inimigo voador" =
   `EnemyComponent` + `FlyingComponent`, não `class FlyingEnemy extends Enemy`.
4. **Não importar `three` direto fora de bootstrap.** Use exports do
   `cortex-game-engine` (ADR-0021). Quando faltar algo, registre e
   pergunte antes de cair em fallback.
5. **Arquivo único por classe.** `PositionComponent.ts` exporta
   `PositionComponent`; mesma regra para Systems e factories.
6. **Limite de tamanho: ~200 linhas por arquivo.** Sinal de "fat system";
   quebrar em subsystems ou extrair helpers.

**Regras para o agente** (registradas no `AGENT_SYSTEM_PROMPT`):
- Antes de criar arquivo novo, decidir a categoria: Component, System,
  Entity factory, Scene, util, ou bootstrap (main.ts).
- Reusar arquivos existentes em vez de criar novos quando a
  responsabilidade casa.
- Se uma feature pequena justifica só uma classe, criar **um arquivo
  só** com nome claro — não exigir Components+Systems separados.

## Consequências

- Projetos novos já vêm com a estrutura pronta, o usuário não precisa
  refatorar quando crescer.
- A IA tem critério claro de onde colocar arquivo novo — menos casos
  de "criou no diretório errado".
- Anti-padrões ECS bloqueados explicitamente nas instruções do agente.
- Trade-off: estrutura pode parecer over-engineering pra protótipos
  muito pequenos. Mitigação: pastas vazias com README curto não
  atrapalham, ficam invisíveis até precisar.
- Os READMEs por pasta servem dupla função: lembrete pro usuário e
  contexto pro agente quando ele lista o projeto antes de codar.

## Referências

- ADR-0002 — Arquitetura ECS do engine.
- ADR-0009 — Vendoring do engine (pasta `vendor/`).
- ADR-0021 — Agente deve preferir cortex-game-engine sobre three direto.
