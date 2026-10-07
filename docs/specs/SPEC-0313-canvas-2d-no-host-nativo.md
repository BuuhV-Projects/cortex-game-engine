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

### Rasterização adiada

Estado, transform e caminho rodam na hora; operações de pixel (`fill`,
`stroke`, `fillRect`, `strokeRect`, `clearRect`, `drawImage`, `fillText`,
`strokeText`, `putImageData`, `reset`) entram numa fila com a foto do estado e
só rodam quando os pixels são LIDOS: `canvas.rgba` (upload do three),
`getImageData`, ou `drawImage` com este canvas como fonte (o buffer da fonte é
marcado compartilhado; escrever nele depois troca de buffer — cópia na escrita).
`clearRect`/`fillRect` opaco cobrindo o canvas inteiro, sem clip, descarta a fila
anterior; teto de 20 000 operações pendentes. `clip()` guarda o caminho e a
máscara é calculada só quando alguma operação precisa dela.

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

## Medição (export do DDD 61, PC, janela 1280×720, `--debug`, parado no spawn)

Sonda temporária (removida) somando o tempo dentro do contexto 2D e do `_flush`.

| | execução imediata (1ª versão) | rasterização adiada + otimizações |
|---|---|---|
| canvas no boot | ~3,0 s (`fillText` 2,1 s) | ~1,25 s (gravação 0,16 s + rasterização no upload 1,1 s) |
| canvas no gameplay | **2,3–2,8 s a cada 5 s** (~50% do tempo; radar a 30 Hz) | ~6–8 ms/s de gravação + ~50–100 ms/s de upload (painéis do metrô, 1×/s) |
| fps (HUD/perf-trace) | 14,7 | **24,2** |
| `update` médio / p99 | 64 / 463 ms | **4,6 / 6,4 ms** |
| `world` | 23–28 ms | 11,2 ms |
| `render` | 24–31 ms | 30,5 ms (host — ver `perf-nativo-teto-arquitetural`) |
| `precompile` | 7,5 s | 6,9 s |

O que resta do canvas no gameplay: os 8 painéis do metrô (760×170, grade de LED
+ texto com `shadowBlur`), repintados no mesmo quadro 1×/s — um pico de dezenas de
ms nesse quadro. Próximo passo se incomodar: blur/blit em C++ (ADR novo) ou o
jogo escalonar as repinturas.

## Achados fora do canvas (validação do DDD 61)

- **Lataria/cabine do carro somem no export**: o jogo cria o carro e o põe na
  cena ANTES do `buildScene`, e só chama `setupVehicle` depois. No host, o
  `buildScene` funde o estático (`mergeStaticScene`, SPEC-0120 — só no nativo) e
  leva o carro junto (lataria, cabine, lanternas e rodas viram cenário parado no
  spawn; o carro de verdade fica sem malha). Provado com sonda: tirando o nó
  `carro-detetive-*` da fusão, os "fantasmas" somem. Correção (fora desta spec):
  o jogo marcar o carro como dinâmico antes do `buildScene` (ex.:
  `userData.cortexVehicle`) ou o engine adiar a fusão / reconhecer o veículo.
- **Detetive invisível no export**: câmera no mesmo lugar do browser
  (y = 4,3, pitch −20°), mas o boneco não aparece. Não investigado (fora do canvas).
- **Radar/mapa não aparecem**: são `<canvas>` DOM (SPEC-0029 do jogo); o host não
  compõe DOM. Agora existem e são desenháveis; mostrar exige um widget de canvas
  na UI de runtime (decisão à parte).
- `RigidBody.setEnabled` faltando no `rapier-compat` (ver acima) — a validação
  usou um stub temporário NÃO commitado.
- GLBs de vegetação do jogo são ponteiros Git LFS não baixados (o cook avisa
  "version ht… is not valid JSON") — pré-existente.
