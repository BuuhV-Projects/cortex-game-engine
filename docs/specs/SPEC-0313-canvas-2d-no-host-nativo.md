# SPEC-0313 — Canvas 2D no host nativo

**Data:** 2026-10-07
**Status:** aceito
**Decisão:** ADR-0312

## Contexto

Jogos que pintam texturas e HUD em `CanvasRenderingContext2D` (DDD 61,
street-racing-61, teste-brasilia) morriam no boot do export nativo: o canvas do
dom-lite era inerte. Esta spec descreve o shim que implementa o canvas 2D no
host (`native/js/src/shims/canvas2d/`).

## Decisão

### Onde o canvas nasce

- `document.createElement('canvas')` (e `createElementNS`), `new OffscreenCanvas(w, h)`
  e `<canvas width=… height=…>` dentro de `innerHTML` devolvem um canvas 2D.
  O dom-lite tem um registro de fábricas por tag (`registerElementFactory`).
- O canvas é um elemento do dom-lite (style, eventos, `getBoundingClientRect`)
  com `width`/`height` (default 300×150; atribuir — mesmo o mesmo valor — limpa
  os pixels e reinicia o estado do contexto, como no browser),
  `getContext('2d')` (sempre o mesmo contexto; `'webgpu'` → `null`) e
  `instanceof HTMLCanvasElement === true`.
- `rgba` (ArrayBuffer RGBA8, alfa não pré-multiplicado): o contrato do
  `ImageBitmap` do host. O three sobe o canvas pelo `copyExternalImageToTexture`
  nativo; `texture.needsUpdate = true` re-sobe o conteúdo atual.
- `toDataURL`/`toBlob` lançam `Error` ("não suportado no host nativo").

### dom-lite: `innerHTML` e `getElementById`

Necessário pros canvases de template DOM (radar/mapa do DDD 61, SPEC-0029 do
jogo): `innerHTML = '<tag attr="v">…'` cria elementos inertes filhos
(`childNodes`/`children`), `<style>`/`<script>` viram elemento sem filhos, texto
solto é ignorado. `document.getElementById(id)` procura na árvore do `body`/`head`
(o `'canvas'` continua sendo o canvas do host quando nenhum elemento tem esse id).
Os elementos continuam sem layout: o canvas do radar é desenhável mas não aparece
na tela do nativo.

### Outras lacunas do boot do DDD 61 (achadas no export)

- `<img>` do host (`shims/image.js`) ganha `style` (objeto inerte): o
  `Speedometer` do engine estiliza a agulha e morria em `Object.assign(undefined)`.
- `world.bodies` no `rapier-compat` (RigidBodySet: `forEach`, `len`, `get`,
  `getAll`) — o `ParkTrunks` do jogo itera os corpos criados.
- **Pendente (fora desta mudança):** `RigidBody.setEnabled(on)` não existe no
  host — precisa de uma operação nova no crate `rapier-native`
  (`rb.set_enabled`) e rebuild do host. O DDD 61 chama no boot (`ParkTrunks`) e
  nos trabalhos de veículo (gás, lixo, ônibus).

### API do contexto coberta

| grupo | membros |
|---|---|
| estado | `save`, `restore`, `canvas`, `globalAlpha`, `globalCompositeOperation` (só `source-over` tem efeito), `imageSmoothingEnabled`, `imageSmoothingQuality` (ignorado) |
| transform | `translate`, `rotate`, `scale`, `transform`, `setTransform` (6 números ou `DOMMatrix`-like), `resetTransform`, `getTransform` (`{a,b,c,d,e,f}`) |
| estilo | `fillStyle`/`strokeStyle`: cor CSS (`#rgb[a]`, `#rrggbb[aa]`, `rgb[a]()` com vírgula ou espaço e `%`, `hsl[a]()`, nomes CSS, `transparent`) ou `CanvasGradient`; cor inválida é ignorada (fica a anterior), como no browser |
| gradientes | `createLinearGradient`, `createRadialGradient` (cônico de dois círculos completo), `addColorStop` |
| retângulos | `fillRect`, `strokeRect`, `clearRect` |
| caminho | `beginPath`, `closePath`, `moveTo`, `lineTo`, `rect`, `arc`, `ellipse`, `quadraticCurveTo`, `bezierCurveTo`, `fill(regra)`, `stroke`, `clip(regra)` (`nonzero`/`evenodd`) |
| linha | `lineWidth`, `lineCap` (`butt`/`round`/`square`), `lineJoin` (`miter`/`round`/`bevel`), `miterLimit`, `setLineDash`, `getLineDash`, `lineDashOffset` |
| texto | `font` (lê o tamanho em `px`; família/peso ignorados — Roboto Medium do host), `textAlign`, `textBaseline`, `fillText`/`strokeText` (com `maxWidth`), `measureText` (`width` + bounding boxes de fonte) |
| imagem | `drawImage` 3/5/9 argumentos com canvas 2D, `Image` do host ou `ImageBitmap` (`{width,height,rgba}`); bilinear, ou vizinho mais próximo com `imageSmoothingEnabled = false` |
| sombra | `shadowColor`, `shadowBlur`, `shadowOffsetX/Y` — blur por 3 passes de caixa (aproxima a gaussiana de σ = blur/2) |
| pixels | `getImageData`, `putImageData`, `createImageData`, `ImageData` global |

Fora (lança erro ou é ignorado, nada usa hoje): `createPattern` (lança),
`filter`, `globalCompositeOperation` ≠ `source-over`, `arcTo`, `roundRect`,
`isPointInPath`, `Path2D`, `letterSpacing`, `direction`.

### Rasterização

- Coordenadas do caminho são transformadas pelo transform corrente NO MOMENTO
  da chamada (como o browser); curvas viram polilinha com tolerância de ¼ px.
- Preenchimento: 4 sub-linhas por linha de pixel, cobertura horizontal exata por
  span (acumulador por diferença), regra nonzero/evenodd. O resultado é a
  cobertura de cada pixel, multiplicada pela máscara de clip e pelo `globalAlpha`.
- `fillRect`/`clearRect` com transform sem rotação: caminho rápido (cobertura de
  retângulo direto; miolo opaco por `Uint32Array.fill`).
- Traço: cada segmento vira um quadrilátero de orientação positiva; junções e
  pontas viram polígonos extras; tudo preenchido de uma vez com nonzero (união).
  A largura no dispositivo usa a escala média do transform.
- Composição `source-over` em alfa não pré-multiplicado; amostragem bilinear em
  alfa pré-multiplicado (sem franja escura).
- Texto: máscara do `__cortexRasterText` rasterizada no tamanho de dispositivo
  (fonte × escala do transform), composta pelo mesmo caminho do `drawImage`.
  Métrica vertical da Roboto (`hhea`: ascender 2146, descender −555, 2048/em) —
  um teste confere as constantes contra o `.ttf` do repo.

## Consequências

- Teste: `tests/native/canvas2d.test.ts` (pixels esperados por primitivo,
  gradiente, transform, clip, texto com raster falso, sombra, upload).
- Medição no export do DDD 61: ver "Medição" abaixo.

## Medição

(preenchida na validação do export — ver o fim desta spec)
