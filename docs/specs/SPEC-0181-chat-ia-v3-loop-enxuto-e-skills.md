# SPEC-0181 - Chat IA v3: agent loop enxuto, skills do plugin e subagente

**Data:** 2026-08-02
**Status:** aceito

Implementa o [ADR-0180](../adrs/ADR-0180-conhecimento-do-chat-ia-em-skills-de-plugin.md).

## Contexto

O Chat IA do Studio era um arquivo só — `electron/agent/agentLoop.ts`, 832 linhas —
com o system prompt (~380 linhas) embutido como constante, e mais três subsistemas
acoplados: aprendizado por baseline, regras de validação aprendidas e injeção da
Game Design Bible. O ADR-0180 decidiu mover o método para skills entregues como
plugin local e cortar o que não se pagou. Esta spec descreve o resultado: arquivos,
contratos e o que muda no empacotamento.

## Decisão

### 1. Estrutura de `electron/agent/`

| Arquivo | Responsabilidade |
|---|---|
| `agentLoop.ts` | `runAgent()`: monta as `Options` do SDK, registra MCP servers, roteia permissão. Só orquestração. |
| `agentTypes.ts` | Tipos públicos do turno (`ToolRequest`, `TurnStats`, `AgentEvents`, `AgentMode`, `AgentModel`, `RunAgentOptions`) e `resolveAgentModel()`. |
| `prompt.ts` | `buildSystemPrompt()`: prompt base + índice da API + append do modo plano. |
| `sdkMessages.ts` | `handleSdkMessage()` e a tradução mensagem-do-SDK → evento de UI. |
| `plugin.ts` | `resolvePluginDir()` e o nome das skills/agente do plugin. |
| `engineApiIndex.ts` | Inalterado (ADR-0114). |
| `tools/` | MCP servers in-process. `learn.ts` sai; os demais ficam. |

Removidos: `learning.ts`, `tools/learn.ts`, `validationRules.ts` e os testes
`tests/electron/learning.test.ts` e `tests/electron/validationRules.test.ts`.

### 2. O plugin `cortex-studio`

`.claude/` do repositório ganha `.claude-plugin/plugin.json` e passa a ser um
plugin local válido, sem deixar de ser o diretório de projeto do Claude Code:

```
.claude/
  .claude-plugin/plugin.json     name: "cortex-studio"
  agents/level-builder.md
  skills/{montar-fase, montar-jogo, level-design-plataforma,
          blueprint-fase, fase-por-trechos,
          process-asset-kit, process-asset-kit-2d}/SKILL.md
```

`runAgent` passa ao SDK:

```ts
plugins: [{ type: 'local', path: pluginDir, skipMcpDiscovery: true }],
skills: 'all',
settingSources: ['project'],
```

- `skipMcpDiscovery` — as conexões MCP são nossas (os servers in-process de
  `tools/`); o plugin não declara nenhuma.
- `settingSources: ['project']` — carrega `CLAUDE.md` e `.claude/` **do projeto do
  jogo** (instruções do usuário sobre o jogo dele), sem herdar as configurações
  globais da máquina, que trariam skills de outros repositórios como ruído.
- `skills: 'all'` — as skills do plugin mais as que o próprio projeto definir.

**Nomes:** vindo do plugin, skills e agentes chegam ao modelo **qualificados pelo
nome do plugin** — `cortex-studio:montar-fase`, `cortex-studio:level-builder`. As
mesmas skills, lidas pelo Claude Code no repositório, aparecem sem prefixo
(`montar-fase`). Textos que citam um nome para invocação cobrem as duas formas.

> Verificado num turno real do Chat (projeto vazio, fora do repositório): o modelo
> listou as sete skills e o subagente, todos com o prefixo. A API de controle do
> SDK (`supportedCommands()`) devolve os nomes **sem** prefixo — conferir por ela
> dá falso negativo.

### 3. Resolução do diretório do plugin

`resolvePluginDir()` usa a mesma base dos demais recursos empacotados:

| Ambiente | Caminho |
|---|---|
| Dev (`electron:dev`) | `<repo>/.claude` |
| Empacotado | `<process.resourcesPath>/agent-plugin` |

`electron-builder.json` ganha a entrada correspondente, filtrada para levar só o
que é do plugin:

```json
{ "from": ".claude", "to": "agent-plugin",
  "filter": [".claude-plugin/**", "agents/**", "skills/**"] }
```

Ficam de fora `worktrees/` e anotações soltas na raiz de `.claude/`. Se o
diretório não existir (instalação incompleta), `runAgent` omite `plugins` e segue
sem skills, em vez de falhar o turno.

### 4. Variáveis de ambiente do turno

`runAgent` injeta duas variáveis no `env` repassado ao SDK — a tool Bash herda:

| Variável | Valor | Para quê |
|---|---|---|
| `CORTEX_PLUGIN_DIR` | raiz do plugin (absoluto) | localizar os scripts das skills |
| `CORTEX_KITS_DIR` | `<resourceBase>/kits` (absoluto) | localizar os kits empacotados |

As skills resolvem com fallback para o layout do repositório:

```bash
PLUGIN="${CORTEX_PLUGIN_DIR:-.claude}"
KITS="${CORTEX_KITS_DIR:-kits}"
node "$PLUGIN/skills/blueprint-fase/scripts/render_blueprint.mjs" bp.json "$KITS/platformer-space" out.html
```

Funciona nos dois consumidores: no Claude Code as variáveis não existem e os
fallbacks resolvem a partir da raiz do repositório; no Studio elas são absolutas e
o `cwd` (projeto do jogo) não interfere. Isso também elimina os caminhos absolutos
do repositório que estavam cravados no texto das skills.

**Tools MCP têm precedência sobre os scripts.** Onde o Studio já oferece a
capacidade como tool in-process (`generate_blueprint`, `inspect_assets`,
`measure_glb`, `list_kits`/`import_kit`, `validate_scene`, `playtest_game`,
`critique_scene`), a skill manda usar a tool e trata o script como caminho
alternativo para fora do Studio.

### 5. Prompt base

`prompt.ts` mantém apenas o invariante, na ordem: identidade e idioma; sandbox de
escrita; perguntas em texto; organização de arquivos do projeto (ADR-0022); as
quatro regras anti-padrão de ECS; uso da engine (importar de
`'cortex-game-engine'`, índice da API sob demanda, o que fazer quando falta um
export); **física é dado da cena, editável no Inspector**; dimensão do jogo;
definição de pronto; comandos proibidos no Bash; imagens coladas; e um empurrão
curto para usar as skills.

Mudanças de conteúdo relevantes:

- **3D é o padrão.** Sai a seção `MONTAGEM DE LEVEL (plataforma 2.5D)` inteira e a
  afirmação de que o foco da engine é 2.5D. O prompt passa a dizer: a engine é 3D
  (perspectiva, GLB, PBR, física 3D); 2.5D e 2D **não são tipos de projeto**, são
  resultado do sistema de câmeras e da camada de render escolhida no jogo. Pixel
  art 2D ganha uma linha com o caminho concreto (`projection: 'orthographic'`,
  sprites, tilemap).
- **Física declarada no nó da cena** (`collider`/`player`/`character`), nunca
  cravada só em código — a regra do `CLAUDE.md` da engine, que faltava no prompt e
  é a diferença entre o usuário poder editar no Inspector ou não.
- **Definição de pronto** encolhe para o essencial: `validate_scene` com 0 erros
  antes de qualquer validação visual; depois playtest com os próprios olhos. O
  detalhamento (varredura em close-up região por região, crítica contra
  referência) migra para as skills.
- Saem as seções de aprendizado, de baseline e de correções pendentes.

### 6. `main.ts`

- Some `loadGameDesignBible()`, `detectPendingCorrections()` e os campos
  `gameDesignBible` / `pendingCorrections` do turno.
- `runAgent` recebe `pluginDir: resolvePluginDir()`.
- `envForSpawn()` continua sendo a fonte do `env`; `CORTEX_PLUGIN_DIR` é
  acrescentado dentro de `runAgent`, para o loop ser autocontido.

### 7. `validate_scene` sem regras aprendidas

`tools/validate.ts` deixa de importar `validationRules.ts`. Os thresholds
(`maxGap`, `maxRise`, `maxPenetration`) e as severidades por regra passam a ser
constantes nomeadas no próprio módulo, sobrescritíveis por parâmetro da chamada.
O contrato da tool para o modelo não muda: relatório completo em
`.cortex/validation/`, resumo na resposta.

### 8. Game Design Bible

Removidos: a injeção no prompt, `loadGameDesignBible()`, a entrada de
`extraResources` e o diretório `docs/game-design-bible/`.

## Consequências

- O append do system prompt cai de 32,1 KB para 7,8 KB (−76%, ~6,2k tokens por
  turno): o prompt base encolhe de ~380 para ~120 linhas e a Bible sai do contexto.
  O método passa a custar contexto só quando a skill é acionada.
- `electron/agent/` deixa de ter um arquivo de 832 linhas; `agentLoop.ts` fica em
  torno de 200, com responsabilidade única.
- `.claude/` passa a ser artefato distribuído: alterar uma skill afeta o
  instalador, e o filtro de `extraResources` precisa acompanhar pastas novas.
- Skills que dependem de Blender continuam dependendo dele; no Studio precisam
  reportar ausência com mensagem clara.
- Sessões antigas retomadas por `resume` carregam no histórico o prompt velho —
  comportamento normal do SDK, sem ação necessária.
