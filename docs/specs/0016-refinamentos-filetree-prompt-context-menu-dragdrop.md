# SPEC-0016 - Refinamentos do FileTree: prompt custom, context menu, drag & drop

**Data:** 2026-05-25
**Status:** aceito

## Contexto

Após implementar criar arquivo (SPEC-0011) e criar pasta (SPEC-0015), três
problemas apareceram no uso real do FileTree:

1. **`window.prompt()` não é suportado no Electron** — clicar em "+ Pasta"
   ou "+ Arquivo" jogava `Uncaught Error: prompt() is not supported.`.
2. Para criar dentro de uma pasta específica era preciso navegar até ela
   por outros meios — não havia menu de contexto.
3. Mover arquivos entre pastas exigia sair do IDE.

## Decisão

**Prompt custom** (`customPrompt.ts`):
- Função `customPrompt(title, { placeholder, initial })` retorna
  `Promise<string | null>`.
- Renderiza um `<dialog>` modal com input + Cancelar/OK. Enter envia,
  Esc cancela.
- Reusa o padrão visual dos outros dialogs (ProjectManager).

**Context menu** no FileTree:
- Clique direito em qualquer item abre menu posicionado no cursor.
- Para pastas: "Novo arquivo aqui", "Nova pasta aqui", "Apagar pasta".
- Para arquivos: "Apagar arquivo".
- Clique fora dispensa o menu.
- "Apagar" usa `window.confirm()` para dupla checagem antes do IPC.

**Drag & drop**:
- Cada label (arquivo/pasta) é `draggable=true`, carrega o path no
  `dataTransfer`.
- Pastas e a área raiz da árvore são drop targets. Drop chama
  `fs:move(src, dest)` onde `dest = destDir/<nome do src>`.
- Highlight visual via classe `.drop-target`.

**Novos handlers IPC**:
- `fs:move(src, dest)` — `fs.rename` direto, ambos paths validados.
- `fs:delete(targetPath)` — `fs.rm({ recursive: true })`. Confirmação
  fica no renderer.

## Consequências

- "+ Arquivo" e "+ Pasta" da toolbar continuam criando na raiz; o menu
  de contexto cobre o caso de criar em subpastas.
- Não tem ainda: renomear in-place, copiar (vs mover), undo. Quando virar
  atrito, registrar ADRs próprios.
- `fs:move` e `fs:delete` operam onde o usuário pediu — sem restrição a
  pasta específica (segue a mesma lógica da SPEC-0013 sobre `fs:writeFile`).
- Drag & drop pode falhar em casos extremos (drop em si mesmo, em
  subpasta própria, em arquivo). O renderer filtra "drop em si mesmo";
  o resto cai no `fs.rename` que dará erro do SO — o renderer mostra
  `alert` com a mensagem.
