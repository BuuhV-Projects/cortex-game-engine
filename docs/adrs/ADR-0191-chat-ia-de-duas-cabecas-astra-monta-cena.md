# 0191 - Chat IA de duas cabeças: GPT-6-Astra monta cena, Claude escreve código

**Data:** 2026-09-13
**Status:** aceito — o seletor de modelo foi substituído por modos por tarefa no ADR-0265

## Contexto

O Chat IA do Studio roda sobre o `@anthropic-ai/claude-agent-sdk`: preset
`claude_code` + um append de ~150 linhas (`electron/agent/prompt.ts`) + as
skills do plugin `cortex-studio` (ADR-0180) + sete MCP servers in-process.

O usuário fez a comparação que importa: pediu **o mesmo mapa** de duas formas —
direto pelo Codex CLI (GPT-6-Astra) e pelo Chat IA do Studio. O do Chat IA
ficou nitidamente pior. Diagnóstico inicial dele: "está usando muita regra".

Vale separar o que o prompt de fato carrega, porque não é tudo da mesma
natureza:

- **Método** (a maior parte): organização de pastas, definição de pronto, ordem
  de validação, como usar skills, anti-padrões de ECS. É opinião acumulada.
- **Contrato técnico** (~5 regras): id de nó não-sequencial (ADR-0183), física
  declarada nos campos do nó, `place` assentando por bounding box, importar de
  `'cortex-game-engine'` e nunca de `'three'`. Não são estilo: se o agente as
  ignora, o editor e o Inspector quebram **em silêncio** — o overlay aplica a
  transform de um objeto em outro, a física some do Inspector, as peças flutuam.

E há uma explicação para a diferença observada que não é "regra demais": rodando
direto, o Codex estava **dentro do repositório do engine** e podia ler os ADRs,
o `architecture.md` e o código sozinho, sob demanda. O Chat IA recebe um resumo
fixo empurrado em todo turno e trabalha num diretório — o projeto do jogo — onde
esses documentos **não existem**. A vantagem do Codex não foi ausência de
regras; foi **poder buscá-las**.

### Alternativas consideradas

- **A. Só enxugar o prompt do Claude.** Barato, mas se o ganho veio do modelo e
  do acesso sob demanda, não resolve — e ainda remove a rede de proteção.
- **B. Trocar o Chat IA inteiro para o Codex.** Reescrita grande do
  `agentLoop`, e perde as skills do plugin (ADR-0180), que são o método
  refinado do usuário e funcionam bem para kit/blueprint/fase.
- **C. Duas cabeças, escolhidas pelo usuário (escolhida).** O turno roda no
  Codex/astra **ou** no Claude, conforme a seleção no chat. Cena vai para quem
  provadamente monta melhor; código continua onde as skills e o ecossistema de
  tools já estão.
- **D. Roteamento automático por conteúdo do pedido.** Rejeitada: classificar
  "isso é cena ou é código?" por heurística de texto erra em silêncio e tira do
  usuário a previsibilidade de saber quem vai responder.

## Decisão

**O Chat IA passa a ter duas cabeças, e quem escolhe é o usuário no seletor que
já existe.**

### 1. `AgentModel` ganha `'astra'`

`AgentModel` deixa de ser `'opus' | 'sonnet' | 'haiku'` e passa a incluir
`'astra'` (ADR-0130 já estabeleceu o modelo como escolha por projeto). Ao
selecionar astra, `runAgent` delega para o **`CodexAgentRunner`** novo, que roda
o Codex CLI em modo headless com escrita no projeto, em vez do Agent SDK.

Os demais valores continuam roteando para o Claude, sem nenhuma mudança.

### 2. O contrato sai do prompt e vai para o projeto

As regras que **não podem** se perder deixam de viver no `prompt.ts` e passam a
ser um **`AGENTS.md` no template de projeto novo** (`templates/new-project/`),
acompanhado de um `CLAUDE.md` de uma linha que aponta para ele.

Por que assim:

- É o formato que **os dois** agentes leem nativamente no `cwd` — o Codex lê
  `AGENTS.md`, o Claude lê `CLAUDE.md` via `settingSources: ['project']`.
- Vira **arquivo do jogo do usuário**: ele pode ler, editar e versionar as
  regras do próprio projeto, em vez de elas serem uma constante compilada no
  IDE que ele não vê.
- Reproduz a condição que fez o Codex ir bem: conhecimento **no disco, buscável**,
  em vez de empurrado em todo turno.

O `prompt.ts` do Claude fica só com o invariante que não é do projeto:
identidade, sandbox de escrita, idioma, uso das skills e o índice da API.

### 3. Modelagem 3D continua disponível, mas fora do caminho

`generate_blender_model` (ADR-0189) permanece registrada, e a descrição passa a
dizer que é para **pedido explícito de modelo 3D novo** — não é para ser
chamada por conta própria ao montar um mapa. Montar cena é posicionar assets e
escrever `level.json`; gerar `.glb` é outra tarefa, mais lenta e mais cara.

### 4. Como o Codex roda

```
codex exec --model gpt-6-astra --sandbox workspace-write \
  --skip-git-repo-check -C <projeto> --json -
```

Diferenças **deliberadas** em relação ao ADR-0189 (que só pede texto):

- `--sandbox workspace-write` — precisa escrever `scenes/*.json` e assets.
- **Sem `--ignore-user-config`.** Medido: com essa flag o agente responde
  *"este ambiente permite apenas leitura"* e não escreve nada, mesmo com
  `--sandbox workspace-write`. A flag continua correta para a chamada
  single-shot da modelagem 3D, que é read-only; aqui ela quebraria a feature.
- `--json` — a saída JSONL (`thread.started`, `item.started`/`item.completed`
  com `agent_message`/`file_change`/`command_execution`, `turn.completed` com
  `usage`) é o que alimenta o stream do chat.
- **Sem `--ephemeral`** — a sessão precisa persistir para haver continuidade
  entre turnos, via `codex exec resume`.

## Consequências

**O que melhora**

- Cena passa a ser montada pelo modelo que o usuário mediu como melhor, na
  configuração em que ele mediu (agente com acesso ao disco, lendo o que
  precisa).
- O prompt do Claude encolhe de ~150 para poucas dezenas de linhas, e o que
  sobra é genuinamente invariante.
- As regras do projeto viram **conteúdo do projeto**: visíveis, editáveis e
  versionadas pelo usuário.

**O que piora / o que aceitar**

- **O gate de aprovação não vale para o Codex.** O `canUseTool` (ADR-0018) é do
  Agent SDK; no turno do astra o agente escreve no projeto **sem card de
  aprovação**, limitado ao diretório do projeto pelo `workspace-write`. É uma
  redução real de controle — mitigada por o projeto ser um repositório git, e
  pelo escopo de escrita ser o `cwd`. Se incomodar, o caminho é o próprio
  `--approve-for-me` do Codex, ainda não avaliado.
- **Sem skills no turno do astra.** O plugin `cortex-studio` é do Agent SDK. Um
  pedido de fase completa por kit continua rendendo mais no Claude, com o
  subagente `level-builder`. Os dois caminhos coexistem — e essa é a razão de a
  escolha ser do usuário, não automática.
- **Duas subscriptions viram dependência do Studio** — Claude e Codex. Já era
  verdade desde o ADR-0189 para a modelagem 3D; agora vale para o chat.
- **Projetos já existentes não ganham o `AGENTS.md`**, que entra pelo template.
  Precisam recebê-lo por uma ação explícita, ou os contratos não chegam ao
  agente naquele projeto.

**Substitui parcialmente** o ADR-0180: as skills continuam sendo onde mora o
método do Claude, mas o prompt deixa de ser o lugar dos contratos de projeto.
