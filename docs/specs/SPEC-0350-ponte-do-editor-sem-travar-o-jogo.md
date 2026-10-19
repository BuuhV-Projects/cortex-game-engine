# SPEC-0350 - Ponte do editor sem travar o jogo no Play do Studio

**Data:** 2026-10-19
**Status:** proposta (diagnóstico feito, sem código)
**Relacionados:** SPEC-0349 (o diagnóstico saiu dos testes do auto-rig com o DDD 61)

## Contexto

O usuário via o DDD 61 (D:/jogos/detetive-brasilia) cair para 43–73 fps correndo pelo Play do Studio,
com solavancos visíveis. O mesmo jogo, na mesma máquina e no mesmo build de dev, roda a 75 fps cravados no
Chrome comum (monitor de 75 Hz). A medição abaixo isolou a causa: não é o jogo.

## Diagnóstico (medido em 2026-10-19)

**Ambiente:** instância do Studio em `electron-vite dev`, perfil temporário, CDP, janela de 1600×900
visível. Iframe do jogo com 710×560 e DPR 1. Monitor de 75 Hz (RX 6600). Roteiro: o player corre 6 s
(~36 m) na avenida (`?play=1&clima=sol&hora=12&spawn=comercial`), segurando `moveForward` + `sprint` pelas
ações do jogo e registrando o tempo de cada quadro (rAF). Duas rodadas por situação.

| situação | fps médio | p95 (ms) | max (ms) | quadros > 25 ms | > 33 ms |
|---|---|---|---|---|---|
| A: só o Play, como o Studio entrega | 51,2 / 48,3 | 66,7 / 66,8 | 93,5 / 93,6 | 67 / 56 | 27 / 35 |
| A': idem, sem `cortexDebug=*` | 44,7 / 46,5 | 79,8 / 66,6 | 93,4 / 107 | 66 / 80 | 36 / 31 |
| B: Play + painel Auto-rig (modal) na aba Animações | 46,5 / 41,2 | 53,6 / 79,8 | 93,3 / 93,7 | 94 / 97 | 26 / 32 |
| C': .glb aberto em outra aba fixa, de volta na cena | 62,2 / 62,3 | 40 / 39,9 | 67 / 80 | 32 / 30 | 20 / 20 |
| D: Chrome comum visível, mesmo vite do Play | **75,0 / 75,0** | 13,4 | 13,6 | **0** | **0** |
| E2: Studio + Play com `window.parent = window` no frame do jogo (o `state` não chega ao Studio) | **75,0 / 75,0** | 13,5 | 13,7 | **0** | **0** |

(C, com o .glb como aba ativa, não mede: o iframe fica 0×0 e o rAF dele para.)

**Causa:**
- A ponte do editor da engine (`vendor/cortex-game-engine/index.dev.js` do jogo, ~75896–75921: `rye`/`E`;
  na fonte, o módulo do editor in-game que fala com o Studio por `window.parent.postMessage`) roda a cada
  80 ms: monta o outliner inteiro (`IO`, `idOf`), faz `JSON.stringify` do state e, se mudou, envia. Como os
  NPCs, carros e o player se mexem, ele muda sempre: ~4,7 mensagens `state` por segundo, com o campo
  `outliner` de **~719 KB** (≈ 3,3 MB/s), parado ou correndo.
- O iframe do jogo (`localhost:5174`) e o Studio (`localhost:5173`) são o **mesmo site**: sem site
  isolation, um só renderer (o CDP mostra um processo e nenhum alvo separado para o iframe). O jogo divide a
  main thread com a interface do Studio.
- No Studio, cada mensagem custa: 1,3 s em 6,5 s no listener `message` do Monaco
  (`node_modules/.vite/deps/chunk-SK66NA3A.js:448`, o primeiro a ler `e.data`, que paga a desserialização
  dos 720 KB) e 575 ms em `renderOutliner` (`electron/renderer/EditorPanels.ts`, via `onMessage →
  renderState`: `JSON.stringify` da lista + DOM refeito). O Studio ficou com 29% da thread e o idle com
  0,8%. Foram 16 long tasks de 59–68 ms em 6 s, as mesmas dos picos de 66–93 ms no jogo (cada uma perde 4–6
  vsyncs de 13,3 ms).
- **Não são a causa:** o console (0 mensagens/s correndo), o `cortexDebug=*` (A ≈ A'), o painel Auto-rig e
  a prévia de .glb (pesam pouco perto disso).
- Do lado do jogo, a ponte gasta ~1,7–2,3 s em 6 s amostrados (profiler a 0,5 ms, que infla). Em E2 ela
  continua rodando e o jogo fica em 75: o gargalo é o lado do Studio + a thread compartilhada.

## O que decidir e fazer (próxima sessão)

Caminhos (podem se somar; escolher com medição):
1. **Ponte mais barata:** enviar o outliner só quando a ESTRUTURA mudar (nós criados/removidos/renomeados,
   não transformações), com assinatura barata em vez de `JSON.stringify` do state inteiro a cada 80 ms; com
   o jogo rodando (não pausado no editor F2), ritmo bem menor ou sob demanda (o Studio pede quando o painel
   do outliner está visível). Transformações do nó selecionado podem ir à parte, pequenas.
2. **Studio mais barato:** não deixar o listener do Monaco desserializar mensagens que não são dele (filtrar
   antes / canal dedicado, ex.: `MessageChannel`), e o `renderOutliner` atualizar por diff em vez de refazer
   o DOM.
3. **Jogo em outro processo:** servir o iframe do Play como OUTRO site (ex.: `127.0.0.1:5174` com o Studio em
   `localhost`), para o Chromium/Electron dar processo e thread próprios ao jogo (site isolation / OOPIF).
   Conferir se o Electron do Studio tem site isolation ativo e se nada depende de mesmo-origem (pointer lock,
   postMessage com origem, cookies/localStorage).

## Aceite

- Mesmo roteiro e ambiente da tabela (Studio em dev, janela 1600×900 visível, 75 Hz, `spawn=comercial`,
  corrida de 6 s, 2 rodadas): **Play no Studio igual ao Chrome** — fps médio ≥ 74, nenhum quadro > 25 ms.
- O outliner do Studio continua correto (cria/remove/renomeia aparece; seleção e inspetor funcionam) com o
  jogo rodando e no editor F2.
- Testes do repo (`yarn test`) verdes; sem erro novo de typecheck; `architecture.md` atualizado se a ponte
  ou o processo do Play mudarem.
