# ADR-0312 — Canvas 2D no host nativo: rasterizador em JS, sobe pelo caminho do ImageBitmap

**Data:** 2026-10-07
**Status:** aceito

## Contexto

O DDD 61 (D:/jogos/detetive-brasilia) não passa do boot no export nativo:
`TypeError: undefined is not a function at makeTextures … at buildCity`. No host,
`document.createElement('canvas')` devolve um elemento INERTE do dom-lite (sem
`getContext`), e o canvas do host só responde a `getContext('webgpu')`. O jogo
pinta em canvas 2D as texturas procedurais (fachadas com janelas, céu, letreiros,
placas de ônibus, painéis do metrô, placas de carro, pichação) e as entrega ao
three como `Texture`/`CanvasTexture`. O street-racing-61 e o teste-brasilia
também usam canvas 2D. Nem o engine (`src/`) nem o three criam canvas 2D.

Regras que limitam a escolha: tem que rodar em TODAS as plataformas do host
(PC e Xbox GDK), sem GDI/Direct2D/fontes do sistema; API fiel ao browser
(o jogo não pode saber que está no host); texto com a fonte que o host já embute.

## Alternativas

1. **Rasterizador em JS, no shim** (`native/js/src/shims/canvas2d/`): buffer RGBA
   em `ArrayBuffer`, cobertura por sub-scanline com antialias, texto pelo
   `__cortexRasterText` já existente (stb_truetype + Roboto embarcada, ADR-0103).
   Upload pelo `copyExternalImageToTexture` nativo que já sobe o `ImageBitmap` do
   host (`{width, height, rgba}`) — o canvas expõe `rgba` e o three nem percebe.
2. **Rasterizador em C++** (porta de um subset tipo `canvas_ity`/plutovg)
   exposto por NAPI. Mais rápido por pixel, mas: lib nova pinada no
   `fetch-deps`, superfície NAPI grande (cada chamada do contexto atravessa a
   ponte, ou se grava uma display list), rebuild do host a cada mudança, e mais
   um ponto a portar no GDK.
3. **Contornar no jogo** (texturas em PNG pré-renderizadas no build): vetado —
   o usuário aprovou "sem paliativo", e o próximo jogo bateria no mesmo muro.
4. **Skia/Direct2D/GDI do sistema**: viola a regra de portabilidade (Xbox).

## Decisão

**Alternativa 1.** O canvas 2D é um shim JS em módulos pequenos
(`native/js/src/shims/canvas2d/`), sem mudança no C++:

- **Rasterização em software** num `Uint8Array` RGBA (alfa NÃO pré-multiplicado,
  o mesmo que o `getImageData` devolve). Retângulo alinhado aos eixos tem caminho
  rápido (`Uint32Array.fill` no miolo opaco — é o grosso das chamadas: 87
  `fillRect` no DDD 61); o resto vira polígono em coordenadas de dispositivo e
  passa por um preenchimento por sub-scanline (4 sub-linhas por pixel, cobertura
  horizontal exata) com regra nonzero/evenodd.
- **Texto**: `__cortexRasterText(texto, px)` (fonte única, Roboto Medium) gera a
  máscara; o contexto posiciona pela métrica da fonte (`textAlign`,
  `textBaseline`) e compõe a máscara com a cor/gradiente e o transform.
- **Upload**: o elemento canvas tem `rgba`/`width`/`height` — o mesmo contrato do
  `ImageBitmap` do host. `texture.needsUpdate = true` re-sobe o buffer atual
  (re-desenho de radar, painel, pichação). Nenhum caminho novo no WebGPU nativo.
- **Mover pra C++ só com medição.** Se um canvas redesenhado por quadro custar
  caro no export, os primitivos quentes (preencher span, blit com amostragem)
  vão pra C++ portátil, mantendo a mesma API — decisão a registrar num ADR novo
  com os números (medição atual na SPEC-0313).

### Rasterização adiada (acrescentado na validação, mesma série)

A primeira medição no export (DDD 61, parado no spawn) mostrou o canvas
comendo **~50% do tempo de parede no gameplay** (2,3–2,8 s a cada 5 s): o radar
é redesenhado a 30 Hz (`clearRect` + `clip` + `drawImage` rotacionado dos
ladrilhos do mapa + `stroke` + `fillText`) — e o radar é um `<canvas>` DOM que o
host **nem mostra**. Alternativas: (a) otimizar os primitivos (ou levá-los pra
C++) — o radar continuaria pagando por pixels que ninguém vê; (b) desligar
canvas DOM no host — quebra a fidelidade (o jogo pode ler os pixels);
(c) **adiar a rasterização até alguém LER os pixels**. Escolhido (c):

- estado, transform e caminho rodam na hora (baratos, e o jogo pode lê-los);
  operações de pixel entram numa fila com uma foto do estado;
- a fila roda quando os pixels são lidos: upload pro three (`canvas.rgba`),
  `getImageData`, ou `drawImage` usando o canvas como fonte (com cópia na
  escrita do buffer da fonte, pra a leitura ver o conteúdo da hora da chamada);
- limpar/pintar opaco o canvas inteiro descarta a fila anterior (memória
  limitada num canvas que nunca é lido) + teto de 20 000 operações;
- `clip()` guarda o caminho; a máscara só é calculada se alguém rasterizar.

Junto: cache da máscara de texto, blit sem bilinear quando o transform é só
translação, `fillRect` opaco alinhado ao pixel por `Uint32Array.fill`, e sombra
restrita à caixa desenhada. **C++ não foi necessário**: depois disso o canvas
custa <1% do quadro no gameplay; o que resta são os painéis do metrô (até 8
repinturas de 760×170 com brilho, 1×/s). Números na SPEC-0313.

## Consequências

- O jogo roda o mesmo código de pintura no browser e no host; nenhuma API
  "cortex-only".
- Hermes é interpretado: pintar uma textura inteira pixel a pixel custa caro. O
  caminho rápido do `fillRect` opaco cobre o caso comum; o custo real no boot e
  por quadro está medido na SPEC-0313.
- Visual aproximado do Chrome, não idêntico: uma fonte só (sem negrito real,
  `monospace`/`Impact` caem na Roboto), sombra com blur por caixa (aproxima a
  gaussiana).
- `toDataURL`/`toBlob`/`createPattern` lançam erro claro;
  `globalCompositeOperation` ≠ `source-over` e `filter` são ignorados (ver
  SPEC-0313).
- Os canvases que o jogo monta em template DOM (radar, mapa) passam a existir e
  a ser desenháveis, mas **continuam invisíveis no nativo**: o DOM do host é
  inerte e não compõe elementos na tela. Mostrar canvas DOM no nativo é outra
  decisão (widget de canvas na UI de runtime).
