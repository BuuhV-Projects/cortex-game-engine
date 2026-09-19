# PRD 0007 - Preview nativo no Studio (o editor roda o renderer do jogo)

**Data:** 2026-09-19
**Status:** **M0, M1, M2 e M3 CONCLUÍDOS** (SPEC-0199 a 0204) — faltam M4 e M5

## Problema

O preview do Studio é um `<iframe>` apontando para o vite dev server do projeto
([Preview.ts:434](../../electron/renderer/Preview.ts#L434)). O jogo que o usuário
autora roda em **Chromium**; o jogo que ele publica roda no **host nativo**
(Hermes + wgpu + SDL3). São duas pilhas de render diferentes para o mesmo
conteúdo, e isso cobra três preços:

1. **O que você vê não é o que roda.** Cada diferença entre Dawn (Chromium) e
   wgpu-native já apareceu como bug de campo: vertex color que renderiza branco
   só no export, GLB interleaved que só quebra no host, `let` em closure que o
   Hermes resolve diferente. Todos descobertos *depois* de exportar.
2. **A performance do editor não diz nada sobre a do jogo.** A sessão que
   originou este PRD gastou uma rodada inteira otimizando o preview (render CPU
   20,2 → 6,5 ms com merge+bundles) antes de perceber que o alvo real era o
   host. O usuário resumiu: *"não quero corrigir browser, o que importa é o
   nativo"*.
3. **Dois runtimes para manter.** Toda feature de render precisa funcionar nos
   dois, e os shims do host existem em boa parte para imitar o browser.

A referência é a Unity: o editor usa o mesmo renderer do jogo, e a janela de
Game é o jogo de verdade.

## O que existe hoje (levantado no código)

**Preview:** `<iframe>` com `src` = URL do vite, descoberta por regex no stdout
([Preview.ts:22](../../electron/renderer/Preview.ts#L22),
[Preview.ts:408](../../electron/renderer/Preview.ts#L408)); o vite é um
`spawn` no diretório do projeto ([main.ts:1406](../../electron/main.ts#L1406)).

**Play/Stop não recarrega nada** — é troca de modo pela ponte, com o estado da
cena preservado ([Shell.ts:296](../../electron/renderer/Shell.ts#L296) →
[EditorBridge.ts:168](../../src/editor/EditorBridge.ts#L168)). Recarga real só
no Restart ([Preview.ts:106](../../electron/renderer/Preview.ts#L106)) e na troca
de fase, via `?level=` ([Preview.ts:316](../../electron/renderer/Preview.ts#L316)).

**A ponte IDE↔jogo é `window.postMessage`** (ADR-0056), com handshake
`hello`/`ack` ([EditorBridge.ts:233](../../src/editor/EditorBridge.ts#L233)) e um
único evento `state` por frame, com throttle de 80 ms e diff
([EditorBridge.ts:102](../../src/editor/EditorBridge.ts#L102)). **O conteúdo já
é JSON serializável** — é o ativo mais valioso para este projeto: o contrato não
depende de DOM, só o transporte depende.

**O editor mora no jogo, não na IDE.** F2, seleção por raycast, gizmos e câmera
livre rodam dentro do iframe ([ObjectEditSystem.ts:231](../../src/editor/ObjectEditSystem.ts#L231),
[EditorCameraSystem.ts:101](../../src/editor/EditorCameraSystem.ts#L101)); a IDE
só desenha painéis a partir do `state` e devolve comandos.

**O host nativo hoje** só recebe `argv[1]` (pasta do jogo) e variáveis de
ambiente, e só fala por **stdout** — `console.*` vira `print`
([globals.js:22](../../native/js/src/shims/globals.js#L22)), e o `bench.mjs` já
parseia uma linha `[bench]{…}` do stdout, que é precedente de protocolo. **Não
há stdin, socket, pipe nem IPC.** A janela é SDL3 criada sem parent, e não há
editor no runtime nativo (o bundle resolve `index-runtime.ts`, que exclui o
editor de propósito — ADR-0042).

## Lacunas, em ordem de risco

1. **Resize da surface é um bloqueador conhecido.** `app_window.cpp` registra que
   reconfigurar a surface após resize dá "Invalid surface"/crash no
   wgpu-native/D3D12, e por isso o host roda em tamanho fixo. Um painel de IDE
   redimensiona o tempo todo. **Isto precisa ser resolvido antes de qualquer
   outra coisa** — sem isso, não há preview embutido.
2. **Editor não existe no runtime nativo.** `src/editor/*` é DOM-only. Duas
   saídas: (a) portar o editor para a UI de runtime (`RendererUiBackend`), ou
   (b) manter os painéis na IDE e portar só o que é 3D (raycast de seleção,
   gizmos, câmera livre) — muito menos trabalho, e o contrato da ponte já
   suporta.
3. **Canal bidirecional.** `postMessage` não existe no Hermes. O caminho curto é
   JSON-lines: stdout já funciona; falta **stdin** no host.
4. **Embed da janela.** Electron não reparenta HWND externo; seria `SetParent`
   do Win32 com janela filha sem borda, e o host precisaria aceitar um parent
   (SDL3 suporta a propriedade; hoje não é usada).
5. **Input routing.** Com a janela nativa embutida, foco e teclado ficam
   disputados com o Chromium; não há injeção sintética equivalente ao
   `sendInputEvent` usado hoje no playtest.
6. **Airspace.** Os overlays do viewport (pills, zona de drop, seletor de fase,
   [Preview.ts:179](../../electron/renderer/Preview.ts#L179)) são DOM por cima do
   iframe. Sobre um HWND filho nativo, DOM não compõe — o chrome teria que sair
   do retângulo do preview ou ser desenhado pelo host.
7. **Hot reload some.** O host roda `boot.hbc` pré-compilado; hoje qualquer
   mudança de código é re-bundle + reiniciar o processo. O vite dá HMR hoje.
8. **Screenshot/playtest/thumbnail** dependem de `capturePage` do Chromium
   ([runAndCapture.ts:1](../../electron/agent/playtest/runAndCapture.ts#L1)).

## Roadmap proposto

Cada marco entrega valor sozinho e tem aceite mensurável. **M0 é gate**: se o
resize não for resolvido, o projeto para aqui e a conclusão é que o preview
embutido não é viável com o wgpu atual.

### M0 — Resize da surface no host (gate) ✅ FEITO (SPEC-0199)
Reconfigurar a swapchain no resize sem crash, em janela redimensionável.
**Aceite:** arrastar a borda da janela do host por 30 s, em D3D12, sem "Invalid
surface" e sem vazar memória de vídeo.

### M1 — Canal JSON-lines bidirecional ✅ FEITO (SPEC-0200)
`stdin` no host + um shim que entrega as linhas ao JS; stdout já serve de volta.
Contrato = o mesmo da `EditorBridge` (`hello/ack/state/select/field/...`).
**Aceite:** o host responde `ack` a um `hello` enviado pelo stdin e publica
`state` de uma cena carregada; um script Node dirige tudo sem Electron.

### M2 — Janela nativa embutida no Studio ✅ FEITO (SPEC-0201)
Host aceita um HWND pai; Electron cria o retângulo e faz `SetParent`; resize do
painel propaga para o host (depende de M0).
**Aceite:** o jogo aparece dentro do Studio, redimensiona junto com o painel e o
Stop encerra o processo sem janela órfã.

### M3 — Editor 3D no runtime nativo ✅ FEITO (SPEC-0202/0203/0204)
Portar seleção por raycast, gizmos de transform e câmera livre para rodar no
host, publicando pelo canal do M1. Painéis (outliner/inspector) **continuam na
IDE**, lendo o mesmo `state` de hoje.
**Aceite:** selecionar, mover, rotacionar e focar um objeto pelo preview nativo,
com o Inspector da IDE refletindo ao vivo (regra do repo: Inspector é tempo
real).

### M4 — Paridade de fluxo ▶ EM ANDAMENTO (M4a: SPEC-0205)
Drag-and-drop de asset, troca de fase, screenshot/playtest e console do jogo no
painel da IDE, todos pelo canal nativo.
**Aceite:** a lista da seção "o que o editor exige" inteira funcionando sem
iframe.

> **M4b FEITO (SPEC-0206):** drag-and-drop de asset funciona no preview nativo
> — a janela do host some durante o arraste, o overlay de drop volta a ser o
> topo da pilha, e ela reaparece ao soltar. **Falta** os overlays do viewport
> (pills, seletor de fase) e o screenshot.
>
> **M4a FEITO (SPEC-0205):** preview nativo em um comando (exporta com editor e
> abre) e troca de fase por reinício com `CORTEX_LAUNCH_QUERY`. **Falta** o que
> depende de *airspace* — drag-and-drop de asset e os overlays do viewport — e
> o screenshot/playtest (hoje `capturePage` do Chromium, que não enxerga a
> janela nativa).

### M5 — Desligar o iframe ⛔ BLOQUEADO pelo M4

> Sem drag-and-drop e sem screenshot no preview nativo, desligar o caminho
> Chromium **tiraria capacidade** do Studio. Só começa quando o M4 fechar.
Remover o caminho Chromium do preview e o que existia só para sustentá-lo.
**Aceite:** Studio sem `preview-iframe`; export e editor compartilham um único
runtime.

## Riscos

- **M0 pode não ter solução barata** com o wgpu-native atual; o plano B é
  recriar o device no resize (custoso, mas aceitável num editor) ou fixar o
  preview num tamanho e escalar por blit.
- **Hot reload**: aceitar re-bundle + restart no começo (é o que o host já faz)
  e medir; se ficar insuportável, avaliar recarga só do bundle do jogo.
- **Regressão de produtividade**: até o M4, o preview nativo é pior que o iframe
  em algum fluxo. Manter os dois lado a lado (flag) até a paridade, e só então
  o M5.
- **Escopo**: este PRD substitui o que os ADRs 0005/0042/0056 consolidaram
  (Studio Chromium + host restrito ao jogo). Cada marco que contrariar um desses
  registros atualiza o registro na mesma mudança.

## Fora de escopo

Portar os **painéis** da IDE (outliner, inspector, chat, Monaco) para o host.
Eles continuam em DOM no Electron — o que este PRD elimina é o **viewport**
Chromium, não a IDE.
