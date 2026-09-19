# 0207 - Overlays do viewport no preview nativo (M4c do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito — **falta validação visual**, ver abaixo

> **Implementação REMOVIDA da main** (ADR-0212): o preview nativo no Studio foi
> pausado e este código vive na branch `feature/preview-nativo-no-studio`.
> A spec fica como registro do que foi construído e de por que funcionava assim.

## Contexto

Última pendência de *airspace* do M4. O viewport do Studio tem pills flutuando
sobre o palco — seletor de fase, objeto selecionado, ferramentas de gizmo,
atalhos e o contador de perf. Elas são DOM, e a janela nativa fica **sempre**
acima de todo DOM: no preview nativo, as pills simplesmente desapareceriam.

O truque do M4b (esconder a janela) não serve aqui: aquilo vale para um instante
(o arraste), não para controles permanentes.

## Decisão

**A janela do host não ocupa o palco inteiro.** Duas faixas ficam reservadas —
uma em cima, outra embaixo — e o retângulo enviado ao host encolhe para caber no
meio. As pills deixam de flutuar sobre o jogo e passam a viver nessas faixas,
como uma barra de ferramentas.

- `electron/renderer/previewBounds.ts` — `nativePreviewBounds(stage, bars)`,
  função pura: desconta as faixas, arredonda a geometria fracionária do layout
  e devolve `null` quando não sobra área útil (painel colapsado ou baixo demais;
  uma janela 0×0 não é configurável no wgpu).
- `Preview` usa a função e aplica a classe `native-preview` no palco enquanto o
  preview nativo está no ar.
- O CSS `.native-preview` pinta o fundo das faixas e aproxima as pills das
  bordas. As alturas do CSS e as constantes `Preview.NATIVE_BAR_*` precisam
  bater — a função é a fonte da verdade da reserva, o CSS só pinta.

## Validação

6 unitários em `tests/electron/previewBounds.test.ts`: desconto correto das
faixas, arredondamento, caso sem faixas, palco colapsado, palco mais baixo que
as faixas e palco do tamanho exato das faixas.

**O que NÃO foi validado:** a aparência com o Studio rodando. A geometria está
testada, mas se as pills ficam bem posicionadas dentro das faixas — e se 38 px
é a altura certa — só um olho no Studio aberto responde. Deixei sem validar em
vez de afirmar que está pronto.

## Consequências

- O jogo no preview nativo fica um pouco menor que o palco (76 px a menos de
  altura). É o custo de manter os controles visíveis sem sobrepor.
- Mudar a altura das pills exige mexer nos **dois** lugares (CSS e constantes).
  Se divergirem, sobra ou falta fundo atrás das pills — nada quebra, mas fica
  feio.
- O `legend`/menu de fase, que expandem para baixo, podem passar da faixa e
  cair sobre a janela nativa (ficando invisíveis). Não resolvido: quando o menu
  de fase estiver aberto, o caminho provável é esconder a janela como no M4b.
