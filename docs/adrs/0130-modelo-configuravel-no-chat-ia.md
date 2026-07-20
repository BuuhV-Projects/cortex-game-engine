# 0130 - Modelo configurável no Chat IA (default Sonnet)

**Data:** 2026-07-19
**Status:** aceito

## Contexto

O Chat IA do Studio (agente embutido, ADR-0014/0017) roda sobre o
`@anthropic-ai/claude-agent-sdk` com o preset `claude_code`. A autenticação é a
mesma do Claude Code CLI do usuário: OAuth da assinatura (`~/.claude/.credentials.json`),
sem `ANTHROPIC_API_KEY` no ambiente. Confirmado em diagnóstico: não há credencial
alternativa — CLI e Studio compartilham a mesma conta e o mesmo pool de limite.

O Chat vinha batendo o **limite de uso** ("You've hit your limit · resets ...")
enquanto o CLI continuava funcionando. Causa:

1. **Modelo Opus por herança.** O `agentLoop` **não definia `model`** nas
   `Options` do SDK, então herdava o `model: "opus[1m]"` do `~/.claude/settings.json`
   global. Nos planos de assinatura o **teto de Opus é bem menor** que o de Sonnet.
2. **Volume por turno muito alto.** Cada mensagem injeta system prompt extenso +
   índice da API do engine + Game Design Bible + histórico completo via `resume`.
   Em Opus, isso esgota a cota semanal em poucas mensagens.

## Decisão

Tornar o modelo do backend **escolhível na UI do Chat**, com **Sonnet como
default**:

- `agentLoop.ts`: novo tipo `AgentModel = 'opus' | 'sonnet' | 'haiku'` (aliases
  curtos que o Claude Code resolve pro id concreto — não fixamos versão) e campo
  `model?` em `RunAgentOptions`, injetado em `queryOptions.model`. Função pura
  `resolveAgentModel(raw)` normaliza o valor cru do IPC (default `sonnet`).
- IPC `ai:chat` ganha 3º parâmetro `model` (preload + `types.ts` + handler no
  `main.ts`, que usa `resolveAgentModel`).
- `Chat.ts`: botão-toggle na barra do header (espelha o toggle de modo) ciclando
  `Sonnet → Opus → Haiku`. A preferência é **por projeto**, persistida em
  `localStorage['chat_model:<projectDir>']` e recarregada ao abrir/trocar projeto
  (diferente do `mode`, que é global). O valor viaja no `chat()` até o SDK.
- i18n (pt/en) e CSS (`.chat-model-btn`, cor por modelo).

Teste unitário em `tests/agentModel.test.ts` cobre `resolveAgentModel` (aliases
válidos + fallback pra sonnet).

## Consequências

- O Chat sobe em **Sonnet por default** — cota muito maior, para de competir com
  o Opus que o usuário usa no CLI, e resolve o "hit limit" sem configuração.
- Quem quiser mais capacidade em tarefas difíceis escolhe **Opus** por projeto
  (ciente do teto menor); **Haiku** fica pra respostas rápidas/baratas.
- A escolha é por projeto, não global: projetos diferentes podem usar modelos
  diferentes. Não persiste no `cortex.json` do jogo (é preferência de ferramenta,
  não config versionada do projeto) — fica em `userData` via localStorage.
- **Não** reduzimos o volume por turno (Bible/índice continuam injetados). Se o
  limite voltar a incomodar mesmo em Sonnet, o próximo passo é enxugar o prompt
  (Bible sob demanda), fora do escopo deste ADR.
