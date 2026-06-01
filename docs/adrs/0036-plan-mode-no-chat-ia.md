# 0036 - Plan Mode no Chat IA

**Data:** 2026-06-01
**Status:** aceito

## Contexto

O Chat IA (ADR-0017) tinha dois modos de execução (ADR-0018): **ask** (cada tool
mutante pede aprovação) e **auto** (roda tudo direto). Faltava um **plan mode**
como o do Claude Code: a IA pesquisa, propõe um plano de implementação e o
usuário aprova **antes** de qualquer edição — útil pra tarefas grandes onde
revisar o approach antes vale mais que corrigir depois.

O `@anthropic-ai/claude-agent-sdk` tem `permissionMode: 'plan'` + a tool
`ExitPlanMode`, mas o comportamento de transição plan→execução depende de
detalhes do SDK (continuação no mesmo turno, `updatedPermissions: setMode`) que
não dá pra validar dentro do IDE sem rodar. Optamos por uma implementação
**no nosso nível**, previsível e sob controle total.

## Decisão

**Plan vira o 3º modo do toggle** do chat: o botão cicla `ask → auto → plan →
ask`. Estilo violeta pra distinguir do auto (accent).

**Fluxo por turno** (não usa `permissionMode`/`ExitPlanMode` do SDK):

1. **Turno de plano** (`mode: 'plan'`):
   - `agentLoop` anexa `PLAN_MODE_PROMPT` ao system prompt: "você está
     planejando, não implementando; pesquise read-only e devolva um plano em
     texto".
   - `canUseTool` bloqueia **qualquer** tool fora de Read/Glob/Grep
     (`behavior: 'deny'`, sem emitir card) — enforcement read-only de verdade,
     independente do prompt.
   - O agente devolve o plano como texto (markdown), o turno termina normalmente.
2. **Aprovação**: o renderer sabe que o turno foi em plan (ele mandou
   `mode:'plan'`); no `ai:done`, se houve texto, mostra a barra **Aprovar e
   executar / Recusar** abaixo do plano.
   - **Aprovar** → troca o modo pra `auto`, e dispara um turno programático
     ("Plano aprovado. Implemente…") que implementa na mesma sessão (o plano já
     está no contexto). Executa em **auto** de propósito: a aprovação do plano
     já é o consentimento; reaprovar cada edit seria redundante. O usuário pode
     Parar a qualquer momento.
   - **Recusar** → some a barra e fica em plan; o usuário digita o ajuste e um
     novo turno de plano roda.

Nenhum canal IPC novo: reaproveita `ai:chat` (com `mode:'plan'`) e os eventos
existentes. O `mode` virou `'ask' | 'auto' | 'plan'` em agentLoop, preload,
types e Chat.

## Consequências

- Implementação previsível e 100% sob nosso controle — não depende do
  comportamento de `ExitPlanMode`/transição de modo do SDK.
- Trade-off: não usamos o workflow de planejamento nativo do SDK (que poderia
  produzir planos mais ricos). O `PLAN_MODE_PROMPT` + enforcement no
  `canUseTool` cobrem o essencial.
- A execução pós-aprovação roda em **auto**. Se isso for agressivo demais pra
  algum fluxo (ex.: Bash destrutivo), revisitar pra executar em ask ou pedir o
  modo de execução na barra de aprovação.
- O plano vira uma mensagem normal do assistente no histórico; a barra de
  aprovação é efêmera (não persiste) — reabrir o projeto não remostra os botões.
- Se o turno de plano for interrompido (Stop) ou der erro, a barra não aparece
  (`lastTurnWasPlan` é resetado).
