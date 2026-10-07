# ADR-0316 — `<canvas>` na UI de runtime: widget que mostra o canvas 2D do host

**Data:** 2026-10-07
**Status:** aceito
**Spec:** SPEC-0317

## Contexto

O ADR-0312 deu ao host nativo um canvas 2D de verdade, mas deixou registrado:
os canvases que o jogo monta em **template DOM** (radar e mapa do DDD 61,
SPEC-0029 do jogo) continuam **invisíveis no nativo** — o DOM do host é inerte
e não compõe elementos na tela. A UI de runtime (ADR-0102, DOM-lite com nomes
HTML5 — ADR-0123) é o único caminho que desenha interface no nativo, e não
tinha canvas. Todo jogo com minimapa/radar/gráfico desenhado em 2D bate nisso.

## Alternativas

1. **Widget `<canvas>` na UI de runtime** (nome HTML5): o widget é dono de um
   `HTMLCanvasElement` real. No browser o backend DOM põe o PRÓPRIO elemento na
   árvore da UI (é o canvas DOM de sempre); no nativo o `RendererUiBackend`
   desenha um quad texturizado com uma `CanvasTexture` do elemento — o upload
   usa o contrato `width/height/rgba` que o ADR-0312 já criou.
2. **Host compor o DOM** (layout de `position:fixed` + z-index de qualquer
   elemento): seria um motor de layout CSS no host — escopo enorme, e duplicaria
   a UI de runtime que já resolve âncora/escala/ordem.
3. **API "cortex-only" no jogo** (o jogo entrega os pixels ao HUD por função
   própria): quebra a regra de API fiel ao browser (o jogo teria dois caminhos).

### Quando re-subir os pixels

- (a) re-subir todo quadro enquanto visível: o mapa (≈1700×800) custaria
  ~5 MB de cópia por quadro mesmo parado;
- (b) o jogo marca sujo (`widget.markDirty()`): API que não existe no HTML5 —
  o mesmo código no browser não precisaria disso;
- (c) **o canvas do host conta versões**: toda operação de pixel enfileirada
  (e todo redimensionamento) incrementa `canvas.__cortexVersion`; o backend
  compara com a versão que subiu e só então marca `needsUpdate`. Fiel ao
  HTML5 (o jogo só desenha) e barato (um inteiro por quadro).

## Decisão

**Alternativa 1 com a política (c).** `UiCanvas` (tag `<canvas>`) estende o
`UiPanel` — ganha `background` (default `transparent`, como no HTML5), `border`,
`border-radius`, `box-shadow`, âncora, `x/y`, opacidade. Atributos
`width`/`height` do template são o **tamanho do bitmap** (como no HTML5) e o
tamanho exibido quando o CSS não define outro; `width`/`height` do CSS esticam
o bitmap (o `object-fit: fill` padrão). O conteúdo fica dentro da borda
(`box-sizing: border-box`, igual nos dois backends).

Sem a versão (host antigo ou outro canvas), o backend re-sobe a cada quadro
enquanto visível — correto, só mais caro. Widget invisível não sobe nada (e,
pela rasterização adiada, nem rasteriza).

## Consequências

- Radar/mapa/minigame em canvas passam a aparecer no nativo sem código
  específico de host no jogo — basta o `<canvas>` estar no template da UI de
  runtime (e o jogo pegar o elemento por `(tpl.get(id) as UiCanvas).canvas`).
- O custo de um canvas no nativo agora é REAL (antes, ninguém lia os pixels e a
  rasterização adiada descartava tudo): rasterizar + subir a cada mudança. O
  jogo controla a frequência (o DDD 61 redesenha o radar a 30 Hz). Números na
  SPEC-0317.
- Eventos de ponteiro NÃO são entregues ao elemento canvas no nativo (o host
  redistribui ponteiro só pro `window`); navegação por controle/teclado funciona.
  Encaminhar ponteiro ao widget é outra mudança, se algum jogo precisar.
- `pointer-events` entra no subset do CSS (nome HTML5) — só o canvas usa (no
  DOM, o canvas é interativo por padrão; `none` deixa o clique passar pro jogo).
- `transparent` passa a ser cor válida no `parseUiColor` (alpha 0) — antes o
  backend renderer a entregava ao `THREE.Color` e saía preto.
