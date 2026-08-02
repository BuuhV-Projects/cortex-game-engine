# 0180 - Conhecimento do Chat IA vive em skills empacotadas como plugin local

**Data:** 2026-08-02
**Status:** aceito

## Contexto

O Chat IA do Studio roda sobre o `@anthropic-ai/claude-agent-sdk` (ADR-0017 V2,
ADR-0018). Desde então, todo conhecimento operacional foi sendo empurrado para
dentro de **uma constante de string**: o `AGENT_SYSTEM_PROMPT` de
`electron/agent/agentLoop.ts` cresceu para ~380 linhas — método de montagem de
level, definição de pronto, ordem de validação, princípios de composição,
instruções de playtest, ciclo de aprendizado. Três problemas concretos:

1. **Custo fixo de contexto.** Tudo é enviado em todo turno, de toda sessão,
   mesmo quando o pedido é "renomeie essa variável". O ADR-0114 já tinha atacado
   o mesmo sintoma no `engine-api.md`, trocando o doc inteiro por um índice com
   leitura sob demanda — mas o prompt em si continuou monolítico.
2. **Desatualização silenciosa.** A maior seção do prompt se chama
   `MONTAGEM DE LEVEL (plataforma 2.5D)` e afirma que "o foco deste engine é jogo
   de plataforma 2.5D". Isso deixou de ser verdade: os jogos reais que consomem a
   engine hoje são 3D (plataforma de obstáculos em 3D, farm sim top-down 3/4,
   investigação em mundo aberto). O prompt continuou ensinando o modelo a montar
   um gênero que o projeto não persegue mais.
3. **Divergência com o que de fato funciona.** Em paralelo ao prompt, o
   repositório acumulou o método que realmente é usado no dia a dia, na forma de
   **skills** e de um **subagente** em `.claude/`: `montar-fase`, `blueprint-fase`,
   `fase-por-trechos`, `process-asset-kit`, `process-asset-kit-2d` e o agente
   `level-builder`. Elas são exercitadas continuamente pelo Claude Code, foram
   refinadas contra fases reais e carregam gotchas medidos. O Chat IA do Studio
   **não enxergava nada disso**: o SDK roda com `cwd` = projeto do jogo do usuário,
   então `.claude/skills` do repositório da engine nunca é descoberto.

Havia ainda dois subsistemas anexos que não se pagaram:

- **Aprendizado por baseline/diff** (`learning.ts`, `tools/learn.ts`,
  `validationRules.ts`, ~750 linhas + ~40 linhas de prompt + detecção no boot da
  sessão): o agente salvava um snapshot da cena entregue, comparava com as
  correções do dev no editor e tentava destilar regras duráveis. O ciclo depende
  de o dev corrigir no editor, aceitar a oferta de aprendizado e aprovar lições —
  uma sequência que na prática não acontece. O custo é permanente (prompt, tools,
  código, `.cortex/` poluído); o retorno ficou hipotético.
- **Game Design Bible** (`docs/game-design-bible/`, injetada inteira no system
  prompt): 25 arquivos, **5,8 KB somados**. São stubs — `level-design/pacing.md`
  na íntegra é "Introduzir novidade a cada 30 segundos." — e o README declara o
  escopo como "geração de jogos 2.5D". Os critérios de design de verdade existem,
  mas na skill `level-design-plataforma` (44 KB, destilados por medição de um mapa
  profissional).

## Decisão

**O conhecimento operacional do Chat IA deixa de morar no system prompt e passa a
morar em skills, carregadas sob demanda.** O prompt base fica com o que é
verdadeiramente invariante — identidade, sandbox do projeto, regras de uso da
engine, comandos proibidos — e o método (montar fase, processar kit, blueprint,
validar) vem por skill quando o pedido pede.

### 1. Entrega: `.claude/` do repositório É o plugin

O SDK aceita `plugins: [{ type: 'local', path }]`, e um plugin é qualquer
diretório que contenha `.claude-plugin/plugin.json` e as pastas `skills/` /
`agents/` — **exatamente o layout que `.claude/` já tem**. Adicionamos
`.claude/.claude-plugin/plugin.json` e o mesmo diretório passa a servir dois
consumidores sem duplicação:

- **Claude Code**, ao trabalhar no repositório da engine, descobre
  `.claude/skills` e `.claude/agents` nativamente, como sempre fez;
- **Chat IA do Studio** carrega o mesmo diretório como plugin local, via
  `plugins` + `skills: 'all'` no `agentLoop`.

No app empacotado, o diretório vai em `extraResources` como `agent-plugin/`. A
resolução é a mesma função `resourceBase()` já usada por templates, kits e
`engine-api.md`: em dev aponta para o repositório, em produção para
`process.resourcesPath`.

Alternativas descartadas:

- **Copiar `.claude/` para cada projeto criado.** Seria descoberto nativamente
  pelo `cwd`, mas polui o projeto do usuário com ferramental da engine, deixa
  projetos antigos de fora e congela a cópia no dia da criação — a skill
  desatualiza em relação à engine que ela dirige.
- **Definir skills e agentes inline em TypeScript** (`agents: {...}` e o texto
  das skills concatenado no prompt). Mantém tudo em um lugar, mas devolve o
  problema original: o conhecimento volta a ser custo fixo de contexto e perde o
  carregamento progressivo, que é a razão de ser da mudança.

### 2. Skills de método saem do `~/.claude` global e passam a viver no repositório

`montar-jogo` (método de construção na engine) e `level-design-plataforma`
(critérios de composição e desafio) estavam só na instalação global do usuário.
São dependências diretas de `montar-fase` e do agente `level-builder`, e falariam
sobre a engine para um Studio que não as teria. Passam a viver em
`.claude/skills/` — fonte única, versionada junto do código que elas descrevem, e
ainda visíveis ao Claude Code quando se trabalha neste repositório.

### 3. Scripts de skill referenciam o plugin por variável de ambiente

As skills invocam scripts próprios (`node scripts/render_blueprint.mjs`, scripts
Blender). O caminho relativo só funciona com `cwd` na raiz do repositório; no
Studio o `cwd` é o projeto do jogo. O `agentLoop` passa a exportar
**`CORTEX_PLUGIN_DIR`** (absoluto) no `env` do SDK — que a tool Bash herda — e as
skills resolvem com fallback:

```bash
PLUGIN="${CORTEX_PLUGIN_DIR:-.claude}"
node "$PLUGIN/skills/blueprint-fase/scripts/render_blueprint.mjs" ...
```

O mesmo comando funciona no Claude Code (variável ausente → `.claude` relativo ao
repositório) e no Studio empacotado (variável absoluta). Preferimos isto a
`${CLAUDE_PLUGIN_ROOT}`, cuja substituição é garantida em comandos de hook, não no
corpo de uma `SKILL.md`. Todos os scripts `.mjs` das skills usam apenas builtins
do Node (`node:fs`, `node:path`, `node:os`, `node:child_process`, `node:zlib`),
então rodam no app empacotado sem `node_modules` próprio.

### 4. O sistema de aprendizado é removido

Saem `learning.ts`, `tools/learn.ts` (`save_baseline`, `diff_corrections`,
`save_rule`), a detecção de correções pendentes no boot da sessão e as seções
correspondentes do prompt. **`validate_scene` fica** — é a peça que se provou:
validação geométrica determinística e barata, pré-requisito de qualquer validação
visual. Seus thresholds passam a ser defaults do código, sobrescritíveis por
parâmetro na chamada, sem o arquivo `.cortex/validation-rules.json` aprendido.

### 5. A Game Design Bible é removida

Sai a injeção no prompt, o loader do `main.ts`, a entrada de `extraResources` e o
diretório `docs/game-design-bible/`. O papel dela é exercido, com conteúdo real e
sob demanda, pela skill `level-design-plataforma`.

## Consequências

- **Contexto por turno cai 76%.** O append do system prompt sai de 32,1 KB
  (prompt 25,5 + bloco de dimensão 1,1 + Bible 5,5) para 7,8 KB — cerca de 6,2 mil
  tokens a menos em **todo** turno, de toda sessão. Uma conversa de refactor não
  paga mais pelo método de montagem de fase.
- **Uma fonte de verdade para o método.** O que é refinado trabalhando no
  repositório com o Claude Code é literalmente o que o Chat IA do Studio executa.
  Antes eram dois corpos de conhecimento divergindo em silêncio.
- **Tudo que vem do plugin é qualificado pelo nome dele.** No Chat, o modelo vê
  `cortex-studio:montar-fase`, `cortex-studio:level-builder` e assim por diante;
  no Claude Code, trabalhando no repositório, as mesmas skills aparecem sem
  prefixo (`montar-fase`). Textos que citam um nome para invocação precisam
  cobrir as duas formas. (A API de controle do SDK lista as skills sem prefixo —
  medir por ela engana; o que vale é o que o modelo enxerga.)
- **Novo passo no empacotamento.** `.claude/` vira artefato distribuído: mexer nas
  skills passa a afetar o instalador, e o filtro de `extraResources` precisa
  excluir o que não é do plugin (`worktrees/`, anotações soltas).
- **Perde-se o caminho de aprendizado automático.** Corrigir a IA volta a ser
  editar a skill — explícito e revisável, mas manual. Dado que o ciclo não era
  exercido, trocamos um mecanismo teórico por um praticado.
- **Skills que dependem de Blender continuam dependendo.** `process-asset-kit`
  exige Blender instalado (`BLENDER_PATH`); no Studio ela precisa falhar com
  mensagem clara em vez de travar. Skills de kit passam a mirar o projeto aberto
  (`assets/<kit>/`), não o catálogo da engine.
- **Skills globais deixam de existir fora do repositório.** `montar-jogo` e
  `level-design-plataforma` não estarão mais disponíveis ao trabalhar em outros
  repositórios — o que é coerente: elas falam da cortex-game-engine.
