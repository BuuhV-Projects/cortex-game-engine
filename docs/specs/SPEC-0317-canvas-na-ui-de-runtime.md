# SPEC-0317 — `<canvas>` na UI de runtime

**Data:** 2026-10-07
**Status:** aceito
**Decisão:** ADR-0315

## Contexto

Radar e mapa do DDD 61 são canvas 2D em template DOM — invisíveis no export
nativo (ADR-0312, Consequências). Esta spec descreve o widget `UiCanvas` da UI
de runtime que os mostra nos dois mundos.

## Decisão

### Autoria (template)

```html
<style>
  .radar { pointer-events: none; }
  .map { border: 3px solid #000000; }
</style>
<canvas id="radar" class="radar" width="180" height="180" anchor="bottom-left" x="38" y="-32"></canvas>
<canvas id="map" class="map"></canvas>
```

- Tag `<canvas>` → `UiCanvas` (estende `UiPanel`).
- Atributos `width`/`height` = **tamanho do bitmap** (`canvas.width/height`,
  default 300×150 do HTML5) e também o tamanho exibido quando o CSS não define.
- CSS `width`/`height` = tamanho exibido (estica o bitmap). `background`
  (default `transparent`), `border`, `border-radius`, `box-shadow`, `opacity`:
  os do `UiPanel`. O bitmap fica dentro da borda (border-box).
- CSS novo no subset: `pointer-events: auto|none` (só tem efeito no canvas, e só
  no browser; default `auto`, como no HTML5).

### API (TS)

```ts
const hud = await loadUiTemplate(game.ui, 'assets/ui/hud.html');
const radar = (hud.get('radar') as UiCanvas).canvas.getContext('2d')!;
// desenha quando quiser — nada mais
```

`new UiCanvas({ canvas?, width?, height?, ... })`: sem `canvas`, cria um com
`document.createElement('canvas')`. `widget.set({ width, height })` muda só o
tamanho exibido; o bitmap é do jogo (`canvas.width = …`). Tamanho exibido 0 =
o do bitmap.

### Backends

- **DOM** (`DomUiBackend`): o nó do widget É o `canvas` (vai pra raiz da UI,
  absoluto, com borda/fundo/raio/sombra/opacidade no `style`). O browser pinta.
- **Renderer** (`RendererUiBackend`, nativo): quad com `MeshBasicMaterial`
  (`map` = `CanvasTexture` sRGB, `toneMapped=false`, blend de composição do
  ADR-0105), na camada da imagem (acima do fundo/borda), no rect de conteúdo
  (rect − borda). A cada `sync`, para cada `UiCanvas` visível, compara
  `canvas.__cortexVersion` com a versão subida; mudou → `needsUpdate = true`
  (o upload lê `canvas.rgba`, que rasteriza a fila adiada). Bitmap mudou de
  tamanho → textura e material novos (os antigos vão pro descarte adiado de 2
  quadros). Sem `__cortexVersion` → re-sobe todo quadro visível.
- **Host** (`native/js/src/shims/canvas2d/`): `__cortexVersion` incrementa em
  toda operação de pixel enfileirada e em todo redimensionamento.

### Fora do escopo

- Ponteiro (wheel/drag/clique) entregue ao elemento canvas no nativo.
- `object-fit`/`image-rendering` (sempre `fill` + filtro linear).

### Laço quente do canvas 2D (achado na medição, mesma série)

Com o radar finalmente lido todo quadro, o custo da rasterização em JS apareceu.
Duas mudanças genéricas no shim (`native/js/src/shims/canvas2d/`), sem API nova:

- `drawImage` sem tinta (`bitmap.js`, `blitImage`): amostra e compõe no mesmo
  laço lendo/escrevendo `uint32`; pixel fora do clip ou transparente nem é
  amostrado; vizinhança 100% opaca com cobertura 1 vira uma escrita de `uint32`.
- Máscara de clip (`clip.js`): o último clip sem pai fica em cache; o mesmo
  caminho no quadro seguinte (o círculo do radar) reaproveita a máscara.

## Medição (export nativo do DDD 61, 1280×720, parado no spawn)

Sonda temporária no jogo cronometrando o `_flush` do contexto (= rasterização,
que roda no upload) e A/B com o radar desligado.

| cenário | rasterização por desenho | fps |
|---|---|---|
| radar, antes das otimizações | 45 ms | 6,9 (*) |
| radar, `blitImage` | 18,8 ms | 14,5 |
| radar, `blitImage` + clip em cache + moldura em cache no jogo | **11,7 ms** | 15,7 |
| sem radar (A/B) | — | 19,3 |
| mapa aberto, parado (repinta só quando a vista muda — jogo) | 0 | 34,8 |
| mapa arrastando (repinta todo quadro, 1174×525) | ~394 ms | 2,3 |

(*) antes do merge da fusão estática/bonecos na main; os demais na mesma base.

Perfil por operação do radar (por desenho, após tudo): `drawImage` (4 ladrilhos
girados + moldura) ~10 ms; `stroke` 0,2 ms; `fillRect`/`fill`/`fillText` <1 ms.

**Teto conhecido:** rasterizar ~25 mil px (radar) ou ~600 mil px (mapa) por
quadro em JS interpretado (Hermes) não cabe no orçamento. O próximo passo é o
previsto no ADR-0312: levar o laço do `drawImage` (amostrar + compor uma linha)
pra C++ portátil, com a mesma API — decisão para um ADR novo com estes números.
