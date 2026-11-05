# 0695 - Preview avisa enquanto a cena monta

**Data:** 2026-11-05
**Status:** aceito

## Contexto

A SPEC-0694 pôs um aviso com barra sobre o palco do Play enquanto o vite faz o
pré-bundle. O aviso some no `load` do iframe. Só que o `load` marca o fim da
PRIMEIRA carga — o vite servindo o `main.ts`. Logo depois vem a SEGUNDA, a do
próprio jogo: o `main.ts` monta a cena, a cidade, a multidão, os veículos e aquece
os shaders. No DDD 00 isso leva ~70 s, com o palco preto e a Hierarquia se
enchendo aos poucos. O jogo tem tela de loading própria, mas a desliga no editor
de propósito (um overlay a cada reload de script atrapalhava), e um jogo novo nem
tem tela nenhuma.

O engine já sabe quando a carga do jogo está em curso: `game.setLoading(true)` e
o `buildScene` abrem um escopo de carregamento (`beginLoadingScope`,
`src/core/frameYield.ts`), e `inLoadingScope()` responde se há um aberto. A ponte
do editor (`src/editor/EditorBridge.ts`) publica o estado pro Studio a cada
quadro, inclusive durante a carga — é por ela que a Hierarquia se enche.

## Decisão

1. **A ponte publica o carregamento.** A mensagem `state` ganha `loading:
   inLoadingScope()`. Nada muda no `Game.ts` nem no `attachEditor.ts` (ambos acima
   de 500 linhas): o `EditorBridge` importa a função do `frameYield` direto.

2. **O aviso do Preview tem duas fases.** Depois do `load` do iframe, o overlay
   não some: troca o texto para "Montando a cena…" e começa uma segunda barra
   estimada. Ela termina numa `state` vinda daquele iframe com `loading` diferente
   de `true`. Se a ponte já disse `true` nessa carga, o fim é imediato. Se não, o
   `false` precisa se manter por **1,5 s**: a ponte nasce no `new Game` e pode
   publicar antes do jogo abrir o escopo de carga (no DDD 00 há um
   `await i18n.load` entre os dois), e um `true` dentro do prazo mantém a fase 2.
   Um jogo com o engine antigo (sem o campo) fecha o aviso 1,5 s depois da primeira
   mensagem. Um `load` novo do mesmo
   iframe (o reload completo do vite ao editar código) reabre a fase 2 e descarta o
   prazo do `load` anterior; um `load` atrasado depois do Stop é ignorado.

3. **Mesmo mecanismo de barra da SPEC-0694**, com calibração própria
   (`preview_sceneMs:<dir>`, default 30 s) e prazo de travamento de **3 min**: aí o
   texto manda olhar o Console e oferece o mesmo Reiniciar (Stop + Play).

4. **Não esconder página de erro.** Se nenhuma mensagem da ponte chegar em
   **15 s** depois do `load` (o vite serviu uma página de erro, ou o jogo quebrou
   antes de criar o `Game`), o aviso some sem gravar medida, e o palco mostra o que
   o iframe tiver.

5. **A orquestração sai do `Preview.ts`** (491 linhas) para
   `electron/renderer/previewLoadingFlow.ts`: as duas instâncias de
   `createLoadingState`, a escuta de `message` filtrada pelo `contentWindow` do
   iframe e o prazo de contato. Render, escuta e timers são injetáveis — testável
   sem DOM em `tests/electron/previewLoadingFlow.test.ts`.

## Consequências

- O usuário vê o que está acontecendo nas duas cargas, sem palco preto mudo.
- O sinal vem do engine vendorizado. Um projeto só ganha o fim exato da fase 2
  depois de re-vendorizar; até lá o aviso fecha na primeira mensagem da ponte.
- A barra da fase 2 também é estimativa. A carga do DDD 00 varia muito (a cidade
  leva de 4 a 31 s), então a porcentagem pode correr ou arrastar.
- Isto não deixa a carga mais rápida. O maior custo no editor é o
  `game.precompile()` do jogo (36–41 s de ~70 s no DDD 00), assunto do jogo.
