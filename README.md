# cortex-game-engine

IDE (Electron) + motor de jogos 3D em TypeScript, com arquitetura
Entity-Component-System (ECS) e renderização Three.js (WebGPU). Você **cria,
edita e testa o jogo dentro da própria IDE** (o "Studio"): editor de cena visual,
Inspector, física data-driven e um **Chat IA** que monta cenário a partir dos
seus assets. O export de PC é **nativo, sem browser** — o CortexNative
([ADR-0101](docs/adrs/0101-cortexnative-como-export-pc.md)).

## Rodar o Studio em desenvolvimento

```bash
yarn install
yarn electron:dev
```

## Criar e abrir projetos

- **Novo projeto**: **+ Novo Projeto** na sidebar — pede pasta e nome, copia o
  template, vendoriza o engine e roda `yarn install` automaticamente
  ([SPEC-0013](docs/specs/0013-yarn-install-automatico-apos-criar-projeto.md)).
- **Abrir projeto existente**: **Abrir Projeto** — diálogo nativo do SO.
  Persiste no `localStorage` e reabre da próxima vez.

## O que o engine oferece

- **ECS + cena data-driven**: a cena é um `level.json` versionável, com um
  overlay de edição do editor que vence o código/JSON
  ([ADR-0044](docs/adrs/0044-cena-data-driven-json-com-overlay-do-editor.md)).
- **Editor visual (F2)**: mover/rotacionar/escalar, hierarquia, Inspector,
  `Ctrl+Z` ([SPEC-0084](docs/specs/0084-undo-editor.md)), blockout
  paramétrico estilo ProBuilder
  ([SPEC-0071](docs/specs/0071-probuilder-blockout-mesh-editavel.md)).
- **Física editável no Inspector** (Rapier): colisão é **propriedade do
  objeto** (Nenhum / Estático / Character), declarada nos campos do nó — não
  cravada no código ([TDR-0002](docs/tdrs/0002-fisica-dinamica-com-rapier.md)).
- **Scripts anexáveis** estilo MonoBehaviour: componente Script no Inspector
  ([ADR-0085](docs/adrs/0085-scripts-anexaveis.md)).
- **Diálogo + UI de runtime** data-driven, com dois backends (DOM e renderer)
  ([ADR-0070](docs/adrs/0070-sistema-de-dialogo-e-ui-in-game.md),
  [ADR-0102](docs/adrs/0102-ui-runtime-dois-backends.md)).
- **Kits de assets semânticos**: vocabulário curado (`kit.json`) que o Studio e
  o Chat IA usam pra montar cena
  ([ADR-0053](docs/adrs/0053-design-system-de-assets-kit-semantico-sockets-temas.md)).
- **Chat IA agente**: vê os assets do projeto e monta/edita cenário
  (PRDs [0001](docs/prds/0001-chat-ia-assistente-de-projeto.md)/[0002](docs/prds/0002-chat-ia-como-agente.md)).
- **API pública documentada** — gerada com TypeDoc: `yarn docs:engine`
  (referência em `docs/cortex-game-engine/api/`).

## Exportar o jogo para PC (Windows) — CortexNative

O export de PC gera um `.exe` **nativo, sem browser**: o JavaScript do jogo roda
em Hermes + WebGPU nativo (D3D12) + SDL3, com física Rapier nativa
([ADR-0100](docs/adrs/0100-cortex-native-stack-do-host-m0.md)/[ADR-0101](docs/adrs/0101-cortexnative-como-export-pc.md)).
O alvo final é **console/Xbox** ([PRD-0004](docs/prds/0004-cortex-native-port-console-xbox.md)).

> Substitui o antigo instalador Tauri ([ADR-0024](docs/adrs/0024-instalador-final-com-tauri.md),
> congelado). Hoje é **Windows-only** (o host é D3D12).

### Pelo Studio instalado

Abra o projeto e use o **Export nativo** — sai uma pasta `dist-native/` com o
`<jogo>.exe` + dlls + bytecode + `assets.pak`, rodável standalone. O host e o
toolchain de export já vêm embarcados no Studio Windows, então **não precisa de
nada instalado** ([TDR-0003](docs/tdrs/0003-export-nativo-embarcado-no-studio.md)).

### Em desenvolvimento (electron:dev)

Pra exportar rodando o Studio em dev você precisa **compilar o host uma vez**
(Rust + MSVC + Ninja/CMake). Passo a passo e armadilhas em
[docs/cortex-native/architecture.md](docs/cortex-native/architecture.md#build--run).
O export em si:

```bash
node native/scripts/export-game.mjs <pasta-do-projeto>
```

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| [src/](src/) | Engine: `core`, `ecs`, `components`, `systems`, `physics`, `editor`, `scene`, `probuilder`, `dialogue`, `ui`, `io`, `scripts`, `ai`. Vendorizado em cada projeto. |
| [native/](native/) | Host CortexNative (C++/Rust): runtime nativo do jogo + scripts de export. Mapa próprio em [docs/cortex-native/](docs/cortex-native/). |
| [electron/](electron/) | Studio (IDE): main process, preload, renderer, agente IA. |
| [kits/](kits/) | Kits de assets curados (ADR-0053), empacotados no Studio. |
| [templates/](templates/) | Esqueleto copiado em cada projeto novo. |
| [web/](web/) | Website institucional (workspace independente). |
| [docs/](docs/) | `adrs/` + `tdrs/` (decisões), `cortex-game-engine/` (arquitetura + API), `cortex-native/`, `prds/`, `game-design-bible/`. |
| [tests/](tests/) | Testes Vitest do engine. |

## Testes

```bash
yarn test        # vitest
yarn typecheck   # tsc --noEmit
```

## Decisões importantes

As decisões grandes ficam em [docs/adrs/](docs/adrs/) (arquitetura) e
[docs/tdrs/](docs/tdrs/) (tooling/infra). Fundamentais pra entender a forma do
projeto:

- **[ADR-0002](docs/adrs/0002-arquitetura-ecs.md)** — ECS como modelo de jogo.
- **[ADR-0009](docs/adrs/0009-vendoring-engine-em-projetos-criados.md)** — Vendoring do engine nos projetos.
- **[ADR-0044](docs/adrs/0044-cena-data-driven-json-com-overlay-do-editor.md)** — Cena data-driven + overlay do editor.
- **[ADR-0053](docs/adrs/0053-design-system-de-assets-kit-semantico-sockets-temas.md)** — Design system de assets (kits).
- **[ADR-0085](docs/adrs/0085-scripts-anexaveis.md)** — Scripts anexáveis (MonoBehaviour).
- **[ADR-0100](docs/adrs/0100-cortex-native-stack-do-host-m0.md)/[0101](docs/adrs/0101-cortexnative-como-export-pc.md)** — CortexNative (host nativo, export PC).
</content>
