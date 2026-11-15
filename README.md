# cortex-game-engine

IDE (Electron) + motor de jogos 3D em TypeScript, com arquitetura
Entity-Component-System (ECS) e renderização Three.js (WebGPU). Você **cria,
edita e testa o jogo dentro da própria IDE** (o "Studio"): editor de cena visual,
Inspector, física data-driven e um **MCP para o Claude Code** que dá à IA os
kits, os assets e a API do engine. O export de PC é **nativo, sem browser** — o CortexNative
([ADR-0101](docs/adrs/0101-cortexnative-como-export-pc.md)).

## Pre-requisitos

- **Node + Yarn** — o gerenciador do repo e o `yarn` (nunca `npm`).
- **Claude Code >= 2.0** — a IA do Studio é o Claude Code (CLI, VS Code ou desktop) com o
  MCP `cortex`, que expõe os kits, a medição/thumbnail de `.glb`, a validação de cena e a API do
  engine ([ADR-0736](docs/adrs/ADR-0736-mcp-do-cortex-no-lugar-do-chat-ia.md)).
- **Blender >= 4.0** (`BLENDER_PATH`, instalação padrão ou `PATH`) — thumbnails do
  `inspect_assets`, auto-rig e os scripts das skills.
- **Git** — commit inicial do projeto novo e o Git Bash do auto-rig.

O instalador checa esses três no fim da instalação, mostra o que falta e registra o MCP no
Claude Code ([SPEC-0738](docs/specs/SPEC-0738-instalador-checa-requisitos-e-registra-mcp.md)). O
editor roda sem eles; só a IA e as funções citadas dependem.

### MCP `cortex`

Em dev, depois de `yarn build:mcp`:

```bash
claude mcp add --scope user cortex -- node "<repo>/out/mcp/cortex-mcp.mjs"
```

No Studio instalado, o registro é automático. Para registrar depois (Claude Code instalado após o
Studio), no PowerShell:

```powershell
$env:ELECTRON_RUN_AS_NODE=1; & "<Studio>\TS Cortex Studio.exe" "<Studio>\resources\mcp\cortex-setup.mjs" --register
```

## Buildar as dependencias da engine

```bash
yarn build:host
yarn build:host --Limpar                      # obrigatório quando fontes saem do CMakeLists.txt
yarn build:host --Alvo cortex_host_tests      # só o harness
```

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
  a IA (MCP `cortex`) usam pra montar cena
  ([ADR-0053](docs/adrs/0053-design-system-de-assets-kit-semantico-sockets-temas.md)).
- **MCP `cortex` para o Claude Code**: kits, medição/thumbnail de `.glb`, validação
  de cena e a API do engine ([ADR-0736](docs/adrs/ADR-0736-mcp-do-cortex-no-lugar-do-chat-ia.md)).
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
| [docs/](docs/) | `adrs/` + `tdrs/` (decisões), `specs/`, `cortex-game-engine/` (arquitetura + API), `cortex-native/`, `prds/`. |
| [.claude/](.claude/) | Skills e subagentes do Claude Code para trabalhar no engine (ADR-0180). |
| [mcp/](mcp/) | Servidor MCP `cortex` e o `cortex-setup` do instalador (SPEC-0737/0738). |
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

## Download, releases e merge

O repositório do engine é privado; os instaladores do Studio ficam públicos no
repo só de releases [`cortex-studio-releases`](https://github.com/BuuhV-Projects/cortex-studio-releases/releases/latest)
([TDR-0015](docs/tdrs/0015-repo-privado-release-publico-e-auto-merge-proprio.md),
[SPEC-0740](docs/specs/SPEC-0740-instaladores-no-repo-publico-de-releases.md)). O `release.yml` corta a versão
aqui e publica a mesma release lá.

O merge de PR na `main` sai do workflow `auto-merge.yml`
([SPEC-0739](docs/specs/SPEC-0739-auto-merge-do-pr.md)): checks obrigatórios verdes, Claude review 5/5 e
conversas resolvidas, no head. Resolveu uma conversa sem novo push? Dispare de novo:

```bash
gh workflow run auto-merge.yml --ref main -f pr=<número>
```
