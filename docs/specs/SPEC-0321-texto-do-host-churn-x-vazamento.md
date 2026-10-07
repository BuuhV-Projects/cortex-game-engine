# SPEC-0321 — Texto do host: churn × vazamento (telemetria viva + LRU por bytes)

**Data:** 2026-10-07
**Status:** aceito

## Contexto

A medição R0 do DDD 61 no export nativo viu o perf-log subir sem parar em 80 s:
`text=289x/14,4 MB → 607x/31,8 MB`, `external` 307 → 322 MB, `heap-js`
216 → 275 MB. Projetado linear, passaria de 512 MB em 15–20 min — a mesma classe
do crash de memória externa do Hermes (JSOutOfMemory, ADR-0278).

Quem rasteriza texto no host é o `__cortexRasterText` (stb_truetype, um
`ArrayBuffer` RGBA novo por chamada), chamado por:

- **UI de runtime** (`RendererUiBackend._rasterInto`): só quando o texto/tamanho
  de um Label muda; não guarda o buffer (copia pra textura e solta).
- **Canvas 2D do host** (`canvas2d/text.js`, SPEC-0313): cache de máscaras por
  `px|texto`, limitado a **256 entradas** com `clear()` total ao encher.

No DDD 61 as strings novas por segundo são relógios: o `m:ss` do HUD (UI, 46 px)
e o dos 4 painéis do metrô (canvas, **92 px**, ~100 KB por máscara).

### Diagnóstico

1. **O `text=Nx/MB` do perf-log é cumulativo.** Todos os contadores de
   `perf_arraybuffer` (SPEC-0188) só somam; não existe desconto quando o GC
   coleta. Crescer linear é o comportamento esperado de qualquer churn.
2. **Soak de 12 min do export da main** (`.cortex/soak/runs/antes`): a rampa do
   R0 continua até ~5 min (heap-js 370 MB, external 351 MB) e aí o GC velho do
   Hades roda — heap-js **370 → 168 MB**, external **351 → 291 MB** (abaixo do
   início, 307). O ciclo seguinte recomeça do mesmo vale. É dente de serra, não
   vazamento: o Hades só coleta a geração velha quando `alocado + external`
   passa do alvo, e as máscaras que sobrevivem uma coleta jovem (o cache do
   canvas as segura) só morrem nessa coleta.
3. O que **é** defeito: o cache do canvas limitava por CONTAGEM. Com máscaras de
   92 px isso dá até ~25 MB retidos, e o `clear()` total despeja também o texto
   fixo que é redesenhado todo quadro (ex.: rótulo do painel), re-rasterizando-o
   a cada 256 strings novas.

## Decisão

### Telemetria viva (host)

- `__cortexRasterText(texto, px, origem?)` — `origem` opcional (`"ui"` |
  `"canvas"`; ausente = `outro`). Não muda o resultado; só a telemetria.
- Cada `ArrayBuffer` de raster ganha um `napi_add_finalizer` com
  `bytes << 2 | origem` no `finalize_data`: conta na criação e desconta quando o
  GC finaliza. O perf-log ganha, na linha do heap:
  `| text-vivo: ui=Nx/MB canvas=Nx/MB outro=Nx/MB` — rasters **ainda não
  finalizados** (inclui lixo à espera da coleta velha; o que importa é o vale).
- `CORTEX_TEXT_LOG=1` imprime cada raster no stdout:
  `[text] <origem> <px>px "<texto>"` — pra achar as strings mais frequentes
  (`sort | uniq -c`).
- Removidos `perfTextRasterCount/perfTextRasterBytesMB` (sem leitor).

### Cache de máscaras do canvas 2D: LRU por bytes

- `text.js`: `Map` em ordem de uso; hit move a entrada pro fim; inserção
  despeja do início até caber em `MASK_CACHE_MAX_BYTES` (**8 MB**) e
  1024 entradas (máscara `null` — sem fonte — pesa 0 byte).
- `maskCacheSize()` exporta `{ entries, bytes }` (teste/telemetria).
- Texto redesenhado todo quadro nunca sai do cache enquanto for usado.

### Fora do escopo (medido, não é texto)

- `heap-js` sobe ~0,36 MB/s entre coletas no DDD 61 — lixo JS coletável (cai no
  GC velho junto); não vem do raster de texto (o external entre coletas, sim,
  ~0,14 MB/s, é praticamente só texto).
- Cache por glifo (eliminaria o churn dos relógios): mudança de API do host;
  só se o pico do dente de serra virar problema.

## Validação

- `tests/native/canvas2d.test.ts` — "10 mil strings distintas": bytes retidos
  ≤ 8 MB e o rótulo fixo rasterizado **1** vez. Sem o LRU o rótulo era
  rasterizado 40× (falha).
- Soak ≥ 10 min do DDD 61 no export release, antes × depois — números na seção
  abaixo.

### Resultado do soak

Export release do DDD 61, spawn sem save, janela fora da tela, `CORTEX_VRAM_LOG=1`
(scripts e logs em `.cortex/soak/` da worktree). "Coleta" = queda > 50 MB do heap-js.

| rodada | engine / jogo | duração | coletas | pico heap / ext (MB) | vale heap / ext (MB) | `text-vivo` no vale |
| --- | --- | --- | --- | --- | --- | --- |
| antes | main e4e10dca / 3e2323d | 12 min | 1 | 370 / 351 | 168 / 291 | — (sem telemetria) |
| depois | fix / 3e2323d | 12 min | 1 | 370 / 347 | 163 / 290 | ui 0x, canvas 98x/8,3 MB |
| depois longo | fix / 3e2323d | 25 min | 3 | 368→430→462 / 347→360→368 | 164→171→176 / 290→298→304 | ui 0–3x, canvas 99–128x/8,4–10,9 MB |
| mesclado | fix + main c59b9699 / 5980584 | 12 min | 2 | 297→302 / 426→488 | 163→163 / 290→302 | ui 0x, canvas 184x/6,7 MB (fixo) |

- O R0 só viu a rampa até a 1ª coleta (~5 min). Antes e depois têm o mesmo
  dente de serra: o churn de texto é o mesmo (as strings novas são as mesmas);
  o que muda é o teto retido pelo cache (8 MB × até ~25 MB) e o fim das
  rajadas de re-raster.
- `text-vivo` pré-coleta chega a ~50–70 MB no canvas (máscaras já despejadas do
  LRU esperando a coleta velha) e volta pra ~8–11 MB em toda coleta — os
  rasters são todos coletáveis.
- Nenhum crash/OOM; `error_log.txt` só com a linha do Steam.
- Fora do texto: os vales sobem ~6–7 MB por ciclo de 7 min no soak longo (não
  é texto — `text-vivo` fica parado); e na rodada mesclada (jogo novo, SPEC-0118/
  0119 do DDD 61) o external entre coletas sobe ~0,5 MB/s sem categoria rastreada
  — provável `Float32Array` por desenho com sombra (`canvas2d/shadow.js`) e
  máscara por clip (`clip.js`). Ambos coletáveis; pedem soak > 1 h se forem
  investigados.

### fps (A/B intercalado)

Exports release da main (c59b9699) × branch mesclada, mesmo jogo (5980584),
spawn, 180 s cada, descartando os primeiros 60 s, ordem main→fix→main→fix:

| rodada | frameMs med | p95 | fps (1000/med) | draws med |
| --- | --- | --- | --- | --- |
| main 1 | 35,1 | 42,8 | 28,5 | 150 |
| fix 1 | 35,4 | 40,2 | 28,2 | 143 |
| main 2 | 33,7 | 38,8 | 29,7 | 140 |
| fix 2 | 34,1 | 37,7 | 29,3 | 142 |

Empate dentro do ruído entre rodadas (~1,2 fps); p95 igual ou melhor. A
telemetria (um finalizador por raster novo) não aparece no quadro.

## Consequências

- O perf-log passa a ter a métrica que separa vazamento de churn; a armadilha
  do contador cumulativo está no `docs/cortex-native/architecture.md`.
- Canvas 2D retém no máximo 8 MB de máscaras (antes: até ~25 MB com fonte
  grande) e não re-rasteriza texto fixo em rajada.
- `napi_add_finalizer` por raster: custo de um registro de finalizador por
  string nova (poucas por segundo), nenhum por quadro.
