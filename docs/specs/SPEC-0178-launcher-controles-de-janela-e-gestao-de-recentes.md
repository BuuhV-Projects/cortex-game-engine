# SPEC-0178 - Launcher: controles de janela e gestão da lista de recentes

**Data:** 2026-08-01
**Status:** aceito

## Contexto

A tela inicial do Studio (`Launcher`, aparece quando nenhum projeto está aberto)
tem dois buracos de usabilidade relatados em uso:

1. **A janela fica sem controles.** O Studio roda `frame: false` (janela sem
   moldura do SO — `electron/main.ts`): quem desenha minimizar/maximizar/fechar,
   e quem marca a faixa arrastável (`-webkit-app-region: drag`), é a **menubar
   custom** (`Shell.buildMenuBar`). O launcher, porém, é um overlay
   `position:fixed; inset:0; z-index:40` anexado ao `document.body` — ele cobre a
   menubar inteira. Resultado: na tela de seleção de projetos não há como
   minimizar, maximizar nem fechar, e a janela também **não pode ser arrastada**
   (a faixa de drag está por baixo do overlay). A única saída é o Alt+F4.

2. **A lista de recentes é imutável.** `recentProjects` (localStorage) só cresce:
   `addRecent` insere a cada `project-open` e corta em 10. Projeto renomeado,
   movido, apagado ou aberto por engano fica na tela para sempre.

Ainda no launcher: a lógica dos recentes vivia em funções soltas dentro do
`Launcher.ts`, acopladas ao `localStorage` global — não dava para testar sem DOM
(o repo não tem jsdom; `vite.config.ts` roda os testes em ambiente node).

## Decisão

### 1. Titlebar própria do launcher

O overlay passa a desenhar **a própria titlebar** no topo (altura 30px, mesma da
menubar): faixa arrastável (`-webkit-app-region: drag`) com o nome do app à
esquerda e os três botões de janela à direita, cada um `no-drag` e ligado no IPC
já existente (`windowMinimize` / `windowMaximize` / `windowClose` do
`electronAPI`). O conteúdo (logo, ações, recentes) fica centralizado na área
restante.

Alternativa descartada: recuar o overlay para `top:30px` e deixar a menubar do
`Shell` aparecer. Ela expõe menus que não fazem sentido sem projeto aberto
(Cena, Projeto › Exportar, Re-vendorizar…), e vários deles dependem de um projeto
ativo. A titlebar própria mantém o launcher auto-contido.

### 2. Remover um projeto da lista

Cada card de recente vira uma **linha** (`<div>`) com duas zonas: a área
clicável que abre o projeto (`<button>`, ocupa a linha) e um botão **✕** à
direita que remove **só a entrada da lista** — nunca toca em disco. O ✕ fica
apagado por padrão e acende no hover da linha; o clique usa `stopPropagation()`
para não abrir o projeto. O `title` do botão diz explicitamente "não apaga o
projeto do disco".

A lista fica `<div>` + `<button>` (em vez de `<button>` aninhado em `<button>`,
que é HTML inválido).

### 3. `recentProjects.ts` — lógica pura e testável

`getRecents` / `addRecent` / `removeRecent` saem do `Launcher.ts` para
`electron/renderer/recentProjects.ts`, recebendo o storage por parâmetro
(`Pick<Storage, 'getItem' | 'setItem'>`, default `localStorage`). O módulo é
puro: nenhuma dependência de DOM, testável em ambiente node com um storage falso.

Regras preservadas do comportamento antigo (agora cobertas por teste):
JSON inválido ⇒ lista vazia; `addRecent` do mesmo path **move para o topo** sem
duplicar; a lista satura em `MAX_RECENTS` (10); o nome é o último segmento do
path, tolerando barra final e separador `/` ou `\`.

## Consequências

- A tela inicial ganha minimizar/maximizar/fechar **e** o arrasto da janela, que
  também estava perdido — o usuário não fica mais preso ao Alt+F4.
- Remover um recente é **local ao Studio**: some da lista, o projeto continua no
  disco e pode ser reaberto por "Abrir jogo existente". Não há confirmação (a
  ação é reversível reabrindo o projeto) nem "desfazer".
- Se o projeto removido for o **último aberto**, o Studio ainda o restaura no
  próximo boot: essa restauração vem de `fileTree_projectDir`, chave separada dos
  recentes — fora do escopo desta spec.
- Duas titlebars passam a existir no código (a do `Shell`, para o Studio com
  projeto; a do launcher, para a tela inicial). São mutuamente exclusivas na
  tela; mudança nos controles de janela precisa tocar as duas.
- `Launcher.ts` mantém o estilo inline do arquivo (sem classe CSS nova): os
  estados de hover continuam via `mouseenter`/`mouseleave`, como o resto do
  componente já fazia.
