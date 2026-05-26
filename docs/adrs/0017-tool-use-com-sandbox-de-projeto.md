# 0017 - Tool use no Chat IA com sandbox de projeto

**Data:** 2026-05-25
**Status:** superseded por ADR-0020 (migração para @anthropic-ai/claude-agent-sdk)

## Contexto

PRD-0002 transforma o chat IA em agente: a IA precisa ler arquivos,
escrever arquivos, executar comandos, e chamar os geradores de
script/modelo. A SDK da Anthropic suporta isso nativamente via tool use:
o request inclui `tools=[...]`, a resposta inclui blocos `tool_use`, e a
gente devolve `tool_result`. Mas precisamos definir:

1. Onde mora a lógica do agente (main vs renderer).
2. Como evitar que a IA toque em arquivos fora do projeto aberto.
3. Como o streaming funciona quando o turno inclui tool calls.
4. Como cancelar um turno no meio.

## Decisão

**Onde mora o loop** — todo no main process. O renderer só dispara o turno
e recebe eventos (chunks de texto, tool requests, decisões pra responder).
Motivos:

- Os executores precisam de Node APIs (fs, child_process) que o renderer
  não tem (`contextIsolation: true`).
- Concentrar autenticação Anthropic em um lugar.
- Renderer continua sendo só UI, fácil de testar.

**Sandbox de projeto** — toda tool que aceita `path` valida assim:

```
projectRoot = resolve(<projeto ativo>)
absoluteTarget = resolve(projectRoot, input.path)
if (!absoluteTarget.startsWith(projectRoot + sep) && absoluteTarget !== projectRoot)
  throw "path fora do projeto"
```

`resolve()` normaliza `..` e `.` antes da comparação. Bytes nulos no path
são rejeitados (já fazemos isso em `validatePath`). Sem projeto aberto,
todas as tools que dependem de path falham com erro claro.

**Tools expostas** — sete, divididas em duas classes:

| Tool | Read/Write | Aprovação UI |
|---|---|---|
| `list_files` | read | não |
| `read_file` | read | não |
| `write_file` | write | sim |
| `delete_file` | write | sim |
| `run_command` | exec | sim |
| `generate_script` | write (chama ScriptGenerator) | sim |
| `generate_blender_model` | write (chama BlenderModelGenerator) | sim |

Read-only roda direto, sem perguntar — o pior que pode acontecer é a IA
ver código que ela já podia ver de qualquer jeito. Tudo que escreve em
disco ou executa processo pede confirmação.

**Estado de projeto ativo** — main guarda `currentProjectDir` em variável
de módulo. Renderer chama `project:setActive(path)` no evento
`project-open`. Tools de path consultam esse estado.

**Streaming + tool use** — usamos `client.messages.stream(...)` do SDK
Anthropic. Eventos relevantes:

- `content_block_delta` com `text_delta` → emite `ai:chunk` (texto fluindo).
- `content_block_stop` ou `message_stop` com blocos `tool_use` finalizados
  → enfileira execuções.

Após o stream terminar:

1. Se `stop_reason === "tool_use"`, executa todas as tools enfileiradas
   em sequência (aguardando aprovação quando necessário).
2. Monta a próxima mensagem `user` com array de `tool_result` blocks.
3. Reenvia o histórico e chama `messages.stream(...)` de novo.
4. Repete até `stop_reason !== "tool_use"`.

Cap de segurança: máximo 10 rodadas de tool use por turno do usuário,
pra evitar loops infinitos.

**Cancelamento** — botão "Parar" na UI emite `ai:cancel`. Main marca uma
flag que aborta o stream em andamento e descarta tool calls pendentes.
Erros de stream cancelado viram `ai:done` silencioso.

**Esquema das tools** — definido em `electron/agent/tools.ts` como
`tools: Anthropic.Tool[]`. Cada tool tem `name`, `description`,
`input_schema` (JSON Schema). Documentação no system prompt explica
sandbox e que paths são relativos ao projeto.

## Consequências

- O renderer fica responsável só por exibir e aprovar — fácil de raciocinar.
- Sandbox é simples e robusto (resolve + prefix check) — não cobre symlinks
  maliciosos, mas o usuário só abre projetos próprios, então o vetor é baixo.
- Cada tool exec é um round-trip extra com a API → latência cresce com o
  número de tools no turno. Aceitável (e necessário) pra V2.
- Limite de 10 rodadas evita gastos descontrolados se a IA entrar em loop.

## Alternativas descartadas

- **Sandbox por chroot/jail OS-nativo** — complexo, plataforma-dependente,
  excesso pra um IDE pessoal.
- **Tool use no renderer** — exigiria expor `child_process`/`fs` via
  contextBridge, violando o modelo de segurança do Electron.
- **Função de tool definida no system prompt + parser de texto** — fragil,
  perde os garantias de schema do tool use nativo da SDK.

## Referências

- PRD-0002 — Chat IA como agente.
- ADR-0008 — IPC com contextBridge.
- Anthropic Tool Use: https://docs.anthropic.com/en/docs/tool-use
