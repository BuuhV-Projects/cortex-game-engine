# 0019 - Integração ScriptGenerator e BlenderModelGenerator no Chat IA

**Data:** 2026-05-25 (reativada 2026-05-26, atualizada 2026-05-26)
**Status:** parcialmente aceito — `generate_blender_model` integrado como tool MCP custom. `generate_script` segue não-prioritário; agente usa `Write`+`Edit` para scripts.

> **Atualização 2026-05-26 (parte 1):** o argumento "Write/Bash cobre os
> casos" não se sustenta para Blender — a IA teria que recriar do zero o
> conhecimento de `bpy` (~200 linhas de receitas PBR, `bmesh`, exportação
> GLB) a cada pedido, e ainda lidar com spawn do Blender headless.
> `generate_blender_model` volta como **tool MCP custom in-process**
> registrada via `createSdkMcpServer` do Claude Agent SDK
> ([electron/agent/tools/blender.ts](../../electron/agent/tools/blender.ts)).
> O server precisa do `projectRoot` (sandbox da ADR-0017), por isso é
> criado por turno do agente.

> **Atualização 2026-05-26 (parte 2 — auth):** a restrição original que
> exigia `ANTHROPIC_API_KEY` foi removida. O `BlenderModelGenerator`
> agora chama o Claude via `@anthropic-ai/claude-agent-sdk` em modo
> single-shot (`allowedTools: []`, `systemPrompt` como string, sem
> sessão) — o SDK herda a auth do `claude login` (OAuth) ou usa
> `ANTHROPIC_API_KEY` se disponível, igual ao chat principal. Trade-off
> assumido: perdemos o `cache_control: ephemeral` granular sobre o
> BPY_SYSTEM_PROMPT — o SDK gerencia caching internamente; em prática
> o overhead extra é aceitável.

## Contexto

O engine já tem `ScriptGenerator` (gera código JS ECS a partir de uma
descrição — ADR-0003) e `BlenderModelGenerator` (gera `.glb` rodando
Blender headless — ADR-0004). Hoje só via CLI. Pra o Chat IA virar agente
útil (PRD-0002), essas duas ferramentas precisam estar disponíveis como
tools do agente.

Detalhe: os dois generators instanciam um `Anthropic` cliente próprio,
hardcoded a `process.env.ANTHROPIC_API_KEY`. O Chat IA hoje funciona com
duas fontes de credencial: env var **ou** OAuth do `~/.claude/.credentials.json`
(via `claude login`). Se reusarmos os generators direto, eles falham
quando o usuário só tem OAuth.

## Decisão

**Expor as duas como tools do agente:**

- `generate_script(description: string, target_path: string)` → chama
  `ScriptGenerator.generate(description)`, escreve o `code` retornado em
  `<projectRoot>/<target_path>`. Path validado pelo sandbox (ADR-0017).
  Devolve à IA: caminho do arquivo + explanation que o generator retornou.

- `generate_blender_model(description: string, target_path: string)` →
  chama `BlenderModelGenerator.generate(description, absolutePath)`.
  Devolve à IA: caminho do `.glb` gerado. Erro se Blender não estiver
  instalado.

**Confirmação** — ambas exigem aprovação no chat (ADR-0018). O usuário
vê a descrição que vai virar prompt do gerador, vê o path destino, e
decide. Sem aprovação a tool não executa — não basta o LLM achar que é
boa ideia gerar um arquivo de 800 linhas.

**Credencial** — ambos generators só funcionam com `ANTHROPIC_API_KEY`
no env. Razão: tokens OAuth do Claude Code não foram desenhados pra apps
de terceiros chamando a API por baixo dos panos (vide rate limits +
header beta `oauth-2025-04-20`). Pra V2 mantemos os generators como estão:
se a chamada de `generate_script` ou `generate_blender_model` cair sem
`ANTHROPIC_API_KEY`, devolvemos `tool_result` com erro:

> "Esta ferramenta exige `ANTHROPIC_API_KEY` configurada como variável
> de ambiente. Configure no console.anthropic.com e reinicie o IDE."

A IA vê isso e tipicamente vai explicar ao usuário ou propor um fallback
(escrever o arquivo manualmente via `write_file`).

Refatorar os generators pra aceitar cliente injetado fica pra V3 — fora
do escopo desta entrega.

**Timeouts:**

- `generate_script`: 60s (chamada de LLM única, sem subprocess).
- `generate_blender_model`: 300s (Blender headless pode demorar).

Ambos timeouts são por execução de tool, não por turno do agente. Se
estourar, devolve `tool_result` com erro de timeout — a IA pode tentar
de novo ou desistir.

## Consequências

- Pedidos tipo "crie um sistema de pulo em scripts/jump.js" passam a
  funcionar end-to-end no chat.
- Pedidos tipo "gere uma espada em assets/sword.glb" também — desde
  que Blender esteja instalado.
- Quem só tem OAuth (sem `ANTHROPIC_API_KEY`) consegue conversar mas
  não consegue usar geração avançada — limitação clara, documentada.
- Os generators continuam usáveis pela CLI sem mudança nenhuma.

## Alternativas descartadas

- **Refatorar generators pra aceitar cliente injetado agora** — útil mas
  espalha mudança por código testado; melhor fazer depois com testes
  dedicados.
- **Implementar geração inline (sem reusar as classes)** — duplica
  prompts e lógica de extração de bloco de código; pior.

## Referências

- ADR-0003 — Integração IA Claude (system prompt + caching).
- ADR-0004 — Geração de modelos Blender.
- ADR-0017 — Tool use com sandbox de projeto.
- ADR-0018 — Confirmação de ações destrutivas.
- PRD-0002 — Chat IA como agente.
