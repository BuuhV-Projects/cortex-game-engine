# 0192 - Runner do Codex no Chat IA, prompt enxuto e AGENTS.md do projeto

**Data:** 2026-09-13
**Status:** aceito

Especifica o comportamento decidido no [ADR-0191](../adrs/ADR-0191-chat-ia-de-duas-cabecas-astra-monta-cena.md)
(Chat IA de duas cabeças).

## 1. Seleção: `AgentModel` ganha `'astra'`

`AgentModel = 'opus' | 'sonnet' | 'haiku' | 'astra'`. `resolveAgentModel()`
aceita o novo valor; o default continua `'sonnet'`.

`runAgent()` passa a ser um roteador de uma linha: `model === 'astra'` →
`runCodexAgent()`; qualquer outro → o caminho atual do Agent SDK, **sem
nenhuma mudança de comportamento**.

No seletor do chat a opção aparece como **"Astra (cena)"**, deixando explícito
para que ela é boa — o usuário escolhe a cabeça, nada é roteado por heurística.

## 2. `electron/agent/codex/CodexAgentRunner.ts`

Roda o Codex CLI como agente no projeto e traduz a saída JSONL para o mesmo
`AgentEvents` que o resto do chat já consome — a UI não sabe qual cabeça
respondeu.

**Invocação** (reusa `resolveCodexBin()`/`CODEX_MODEL` do `src/ai/CodexClient.ts`,
fonte única do binário e do id do modelo):

```
<codex> exec --model gpt-6-astra --sandbox workspace-write \
  --skip-git-repo-check -C <projectRoot> --json -
```

Primeiro turno usa o comando acima; turnos seguintes inserem
`resume <threadId>` depois de `exec`, com o `threadId` guardado do turno
anterior.

**Flags e o porquê de cada uma:**

| Flag | Motivo |
| --- | --- |
| `--sandbox workspace-write` | precisa escrever `scenes/*.json`, assets e código no projeto |
| *(ausência de)* `--ignore-user-config` | **medido**: com ela o agente responde "este ambiente permite apenas leitura" e não escreve nada, mesmo com `workspace-write` |
| `--json` | a saída JSONL é a fonte do stream do chat |
| `-C <projectRoot>` | o projeto é o workspace e o limite de escrita |
| *(ausência de)* `--ephemeral` | a sessão precisa persistir para o `resume` do turno seguinte |

**Tradução de eventos** — JSONL do Codex → `AgentEvents`:

| Evento do Codex | Vira |
| --- | --- |
| `thread.started` | guarda `thread_id` (vira o `sessionId` do `TurnStats`) |
| `item.completed` / `agent_message` | `onTextChunk(text)` |
| `item.started` / `command_execution` | `onToolRequest({ name: 'Bash', … })` |
| `item.completed` / `command_execution` | `onToolExecuted(id, saída)` |
| `item.started` / `file_change` | `onToolRequest({ name: 'Edit', … })` |
| `item.completed` / `file_change` | `onToolExecuted(id, arquivos alterados)` |
| `turn.completed` | `onDone(stopReason, stats)` com os tokens do `usage` |
| linha não-JSON / tipo desconhecido | ignorada (o CLI pode ganhar eventos novos) |

`costUsd` vai **0**: o turno roda pela subscription e o CLI não informa custo
em dólar. Reportar estimativa inventada seria pior que reportar zero.

**Aprovação**: no turno do astra não há card de aprovação — o `canUseTool` é do
Agent SDK. Os `onToolRequest` emitidos têm `needsApproval: false` e servem
como **histórico visível** do que o agente fez, não como gate. Está registrado
como consequência aceita no ADR-0191.

**Modo plan**: `mode === 'plan'` troca o sandbox para `read-only` e acrescenta
ao prompt a instrução de devolver plano em texto — o equivalente do ADR-0036
para esta cabeça.

**Erros**: reusa as mensagens do `CodexClient` (binário ausente, versão abaixo
de 0.154.0, exit ≠ 0), que já são acionáveis e em pt-br.

## 3. `templates/new-project/AGENTS.md` — o contrato vira arquivo do projeto

Arquivo novo no template, com **só** o que quebra em silêncio se o agente não
souber:

1. **Cena é dado** — autorar `scenes/*.json`, não código.
2. **Física nos campos do nó** (`collider`, `player`, `character`) — se for
   cravada no código, some do Inspector.
3. **`place` assenta pela base** (bounding box), nunca `y` chutado.
4. **`id` de nó nunca sequencial** (ADR-0183) — prefixo semântico + sufixo
   base36; id decidido na autoria e nunca recalculado.
5. **Importar de `'cortex-game-engine'`**, nunca de `'three'`.
6. **Não rodar `build`/`dev`** dentro do projeto (sujam a árvore); `tsc --noEmit`
   para checar compilação.

Acompanha um `CLAUDE.md` de uma linha apontando para o `AGENTS.md`, para que as
duas cabeças leiam a mesma fonte: o Codex lê `AGENTS.md` nativamente; o Claude
lê `CLAUDE.md` via `settingSources: ['project']`.

Ficam **de fora** do `AGENTS.md` (são método, e método é das skills): ordem de
validação, definição de pronto, organização de pastas, anti-padrões de ECS.

## 4. `prompt.ts` enxuto

Sai do `BASE_PROMPT` tudo que virou `AGENTS.md` ou que já vive nas skills:
organização de pastas e anti-padrões (ADR-0022), regras de cena/física/`place`/`id`,
dimensão do jogo, definição de pronto, comandos proibidos.

Fica: identidade, idioma, sandbox de escrita, perguntas em texto, uso das
skills, regras de uso da engine (import + índice da API) e imagens coladas. O
`PLAN_MODE_PROMPT` não muda.

## Consequências

- **A UI não muda.** As duas cabeças emitem o mesmo `AgentEvents`; o único
  ajuste visível é a opção nova no seletor.
- **O `CodexAgentRunner` é testável sem rede**: a tradução de eventos é uma
  função pura (linha JSONL → chamadas de evento), testada com fixtures
  capturadas de uma execução real.
- **Menos controle no turno do astra** — escrita sem card de aprovação, dentro
  do projeto. Consciente, registrado no ADR-0191.
- **Projetos existentes não recebem o `AGENTS.md`** automaticamente: ele entra
  pelo template. Sem ele, aquele projeto perde os contratos — que agora não
  estão mais no prompt. É a dívida conhecida desta mudança.
- **Um pedido de fase completa por kit ainda rende mais no Claude**, que tem as
  skills e o subagente `level-builder`. Por isso a escolha é do usuário.
