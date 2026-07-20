# SPEC-0014 - Chat IA na sidebar direita (V1)

**Data:** 2026-05-25
**Status:** aceito (implementa o PRD-0001 V1)

## Contexto

O PRD-0001 define o chat IA como assistente do projeto. Precisamos
decidir: (a) onde encaixar visualmente, (b) como propagar streaming de
respostas do main para o renderer, (c) como autenticar com a API
Anthropic, (d) onde guardar o histórico em V1.

## Decisão

**Layout** — uma quarta coluna no `#app` grid, à direita do
`#right-panel`:

```
| #sidebar | #editor-container | #right-panel | #chat-container |
| 240px    | 1fr               | 320px        | 320px           |
```

Trade-off: largura total fica em ~1240px mínimo confortável. Em telas
menores o usuário pode colapsar (futuro) ou redimensionar (futuro).

**IPC** — `ai:chat(messages)`:
- Recebe `messages: Array<{ role: 'user' | 'assistant', content: string }>`.
- No main, chama `Anthropic.messages.stream()` (SDK `@anthropic-ai/sdk`).
- Para cada delta de texto, emite canal `ai:chunk` com `{ text }`.
- No término, emite `ai:done` com `{ stopReason, usage }`.
- Em erro, emite `ai:error` com `{ message }`.
- Modelo padrão: `claude-sonnet-4-5` (rápido, custo razoável).
- System prompt fixo descreve o `cortex-game-engine` (ECS, Three.js,
  TypeScript) para o assistente ter contexto da stack.

**Autenticação** — reusa `src/ai/auth.ts` (env var `ANTHROPIC_API_KEY`
ou credencial do Claude Code). Sem credencial, o handler retorna erro
amigável que o renderer mostra como mensagem de sistema.

**Histórico V1** — em memória no `Chat.ts` do renderer. Cada vez que
`project-open` dispara com um path diferente, o histórico é zerado
(conversas não vazam entre projetos). Persistência em disco fica para
V2 (PRD-0001).

**Sem tool use em V1** — o assistente apenas responde texto. V2 adiciona
ferramentas (`read_file`, `write_file`, `run_command`, etc.) com
aprovação para ações destrutivas.

## Consequências

- Acrescenta uma coluna ao layout — usuários em monitores pequenos
  precisam de scroll horizontal ou esperam o colapso (V2).
- Cada turno custa créditos da API ou cota da subscription. Em V1 não há
  contador visível — usuário acompanha pelo dashboard da Anthropic.
- Sem persistência: refresh da janela perde a conversa. Aceitável em V1
  porque a feature ainda está em validação de UX.
- Streaming melhora percepção de latência mas exige cuidado com locks
  visuais — input fica desabilitado durante a resposta em andamento.
