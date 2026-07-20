# 0020 - Migração para @anthropic-ai/claude-agent-sdk

**Data:** 2026-05-26
**Status:** aceito (substitui a implementação custom dos ADRs 0017/0019)

> **Atualização 2026-05-26 (parcial):** a parte da SPEC-0019 sobre
> `generate_blender_model` foi reativada — não como tool custom no nosso
> loop (que não existe mais), mas como tool exposta via **MCP server
> in-process** do próprio Agent SDK (`createSdkMcpServer`). Write/Bash
> não substituem o `BlenderModelGenerator` porque ele carrega ~200 linhas
> de system prompt curado sobre `bpy`. Ver SPEC-0019 e
> [electron/agent/tools/blender.ts](../../electron/agent/tools/blender.ts).

## Contexto

Os ADRs 0017 e 0019 descreviam uma implementação custom do agente:
buildAnthropicClient próprio com suporte a `ANTHROPIC_API_KEY` ou OAuth do
Claude Code, loop manual de tool use, schemas de 7 tools custom, wrappers
ad-hoc dos generators. Funcionava, mas:

- O OAuth flow exige header `anthropic-beta: oauth-2025-04-20` e prefixo
  específico no system prompt — fácil quebrar.
- Cota OAuth misturada com a do Claude Code CLI gerava 429s ruins de
  comunicar ("token compartilha cota").
- Loop manual de tool use reimplementa o que o SDK do Claude Code já faz.
- Tools custom (Read/Write/Bash) duplicam funcionalidade já madura no
  Claude Code backend.

## Decisão

Migrar a implementação do agente para `@anthropic-ai/claude-agent-sdk`.
Esse pacote oficial expõe `query()` que:

- Spawna o backend Claude Code (binário bundleado por plataforma) como
  subprocess.
- Lê credenciais automaticamente (env `ANTHROPIC_API_KEY` ou
  `~/.claude/.credentials.json` do `claude login`).
- Fornece tools built-in (Read, Write, Edit, Bash, Glob, Grep,
  NotebookRead/Edit, etc.) com sandbox de cwd.
- Gerencia sessão por cwd com `continue: true` pra turnos subsequentes.
- Suporta `canUseTool` callback para aprovar/negar cada chamada de tool
  antes da execução.
- Suporta `abortController` para cancelar streaming.

### Mudanças no código

| Arquivo | Antes | Depois |
|---|---|---|
| `electron/agent/agentLoop.ts` | Loop manual com Anthropic.SDK + max 10 rounds | Thin wrapper sobre `query()` |
| `electron/agent/tools.ts` | 7 tools custom (schemas + executores) | Removido — usa tools built-in do SDK |
| `electron/agent/generators.ts` | Wrappers de ScriptGenerator/BlenderModelGenerator | Removido — agent escreve via Write/Bash com o conhecimento dele |
| `electron/agent/prompts.ts` | Prompts ECS + bpy copiados | Removido — system prompt mínimo, agent já sabe sobre o engine |
| `electron/agent/sandbox.ts` | Validação de path inside cwd | Removido — SDK valida via cwd nativamente |
| `electron/main.ts` | `buildAnthropicClient`, `formatAnthropicError` | Removidos — SDK gerencia auth/erros |

### Aprovação de tools

`canUseTool` callback no `Options` do `query()`:

- Read-only tools (`Read`, `Glob`, `Grep`, `NotebookRead`) → auto-allow.
- Demais (`Write`, `Edit`, `Bash`, `NotebookEdit`, ...) → emite `ai:tool_request`
  ao renderer com card de Aprovar/Negar (ADR-0018). Renderer responde via
  `ai:tool_decision`. Negado → `{ behavior: 'deny', message: 'usuário negou' }`.

### Sessão

A sessão do SDK é keyed por cwd. Mantemos um `Set<string>` no main com os
projetos que já tiveram a primeira chamada — turnos seguintes passam
`continue: true` ao SDK. Quando o usuário troca de projeto, o Set não
precisa ser limpado (cwd nova = sessão nova).

### Cancelamento

`AbortController` é criado por turno. `ai:cancel` chama `controller.abort()`
e nega as aprovações pendentes.

## Consequências

- Autenticação OAuth funciona "de graça" — SDK fala o protocolo certo
  (header beta, refresh de token, etc.).
- Menos código pra manter: ~1000 linhas a menos no `electron/agent/`.
- Agente é tão poderoso quanto o Claude Code CLI (mesmo backend) — pode
  rodar testes, editar múltiplos arquivos, navegar grandes codebases.
- Custo: adiciona uma dependência grande (`@anthropic-ai/claude-agent-sdk`
  com binário por plataforma). Necessário pra build de distribuição.
- O 429 ainda existe em OAuth, mas o SDK tipa o erro como
  `'rate_limit'` em `SDKAssistantMessageError` — UI pode tratar com
  mensagem clara no futuro.
- ScriptGenerator/BlenderModelGenerator CLI ainda existem em `src/ai/`
  e funcionam independente do chat. Quem usa a CLI continua usando.

## Alternativas descartadas

- **Reimplementar o loop com tool use sobre `@anthropic-ai/sdk`**: era o
  estado anterior. Funcional mas frágil pra OAuth e duplica trabalho do
  Claude Code backend.
- **Manter tools custom em paralelo às built-in**: complexidade extra sem
  ganho — built-in cobre tudo que precisávamos.

## Referências

- ADR-0017 — Tool use com sandbox de projeto (superseded).
- ADR-0018 — Confirmação de ações destrutivas (preservado, fluxo igual).
- SPEC-0019 — Integração ScriptGenerator/BlenderModelGenerator (superseded).
- PRD-0002 — Chat IA como agente.
- https://platform.claude.com/docs/en/agent-sdk/overview
