# SPEC-0270 — Modo Orquestrador do Chat IA

**Data:** 2026-09-24
**Status:** aceito
**Decisão:** ADR-0269

## Contexto

Implementação do ADR-0269 sobre os modos da SPEC-0266.

## Decisão

### Seletor

O botão cicla **Orquestrador → Modelagem → Codificar → Orquestrador**.

| modo (UI) | `AgentModel` | `orchestrate` |
| --- | --- | --- |
| Orquestrador | `sonnet`, ou `opus` com o ajuste | `true` |
| Modelagem | `astra` | `false` |
| Codificar | `sonnet`, ou `opus` com o ajuste | `false` |

Persistência na chave `chat_model:<dir>` (valor `orchestrator`). Sem valor
salvo, **Orquestrador**. Valores antigos seguem como na SPEC-0266 (`astra` →
Modelagem; `sonnet`/`opus`/`haiku`/`coding` → Codificar). O ajuste "modelo
mais forte" vale para o Orquestrador também.

O IPC `ai:chat` ganha um 4º argumento, `orchestrate` (booleano).

### Tool `delegate_modeling` (`electron/agent/tools/modeling.ts`)

MCP server `cortex-modelagem`, só no turno com `orchestrate`.

- Entrada: `request` — o pedido autocontido para o Modelagem.
- Roda `runCodexAgent` com o `mode` do turno, retomando a sessão do Astra
  guardada para o projeto (memória do processo; some ao fechar o Studio).
- Eventos do Astra: cards de tool vão direto ao chat; texto é acumulado e vira
  o resultado da tool; `onDone` guarda a sessão e **não** encerra o turno do
  Claude; `onError` vira resultado de erro.
- Em modo Ask a delegação pede aprovação (é o portão — o Astra escreve sem
  card). Em modo Plan ela é bloqueada como toda tool que modifica.

No turno com `orchestrate`, o server `cortex-blender` (`generate_blender_model`)
não é carregado.

### Prompt

Com `orchestrate`, o system prompt ganha a seção "Modo Orquestrador":

- o que é do Modelagem (delegar) e o que é do Codificar (fazer);
- antes de começar, dizer em uma linha quem cuida de cada parte;
- pedido misto: dado primeiro, código depois;
- o pedido delegado é autocontido (o Modelagem não vê a conversa);
- depois de delegar, conferir o resultado (ler a cena/arquivos) antes de
  codar em cima.

## Consequências

- Testes: `chatTask.test.ts` (padrão, ciclo, mapeamento), `agentPrompt.test.ts`
  (seção só com `orchestrate`), `modelingTool.test.ts` (texto vira resultado,
  `onDone` não vaza, sessão retomada, erro vira resultado de erro).
