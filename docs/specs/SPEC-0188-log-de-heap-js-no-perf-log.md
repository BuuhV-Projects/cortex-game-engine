# SPEC-0188 - Heap JS externo: telemetria + fix (cache de imagem sem URL)

**Data:** 2026-08-18
**Status:** aceito

## Contexto

Crash real em campo (export nativo do teste4, `error_log.txt` de 2026-08-18):
`hermes::vm::JSOutOfMemoryError` — o heap JS do Hermes estourou o teto fixo de
512 MB (`hermes_embed.cpp`, ADR-0153: 512 MB é ~8× o live-set esperado do jogo,
~65 MB — estourar isso é vazamento real, não flutuação normal).

O `perf-log.txt` (SPEC-0152/ADR-0153) já rastreia VRAM/working-set do processo e
criação×destroy×release de buffers/texturas WebGPU — foi o método que resolveu
o vazamento de GPU em julho (escada de VRAM 772 → 87 MB/ciclo, depois platô com
cache residente). Mas não tinha NENHUMA visibilidade sobre o heap Hermes: o
crash agora é do lado JS, não de wrappers de GPU.

**Reprodução:** um soak de UMA fase repetida 25× (sem trocar de mundo, sem
hub) já crasha em ~2 min — não precisa da sessão longa completa que expôs o bug
em campo.

## Decisão

**Instrumentação** (permanente, mesmo padrão do log de VRAM):

- `hermes_embed.{h,cpp}` ganha `cortexHermesHeapUsedMB`/`cortexHermesExternalBytesMB`:
  leitura leve (sem forçar GC) via `GC::getHeapInfo` → `allocatedBytes` (heap
  gerenciado) e `externalBytes` (memória nativa presa em objetos finalizáveis —
  é o campo que aparece no `HermesGC OOM: ... external = ...` quando o teto
  estoura por ISSO, não pelo heap gerenciado).
- `native/src/shims/perf_arraybuffer.{h,cpp}`: contador por FONTE de todo
  `napi_create_arraybuffer` do host (pak/imagem/ktx2/io_pool/files/texto) —
  cada ponto de criação chama `trackArrayBufferBytes(source, bytes)`.
- `runFrame` (main.cpp) grava tudo no `perf-log.txt` a cada ~5s (300 frames):
  `heap-js=…MB external=…MB | arraybuffers: pak=…MB img=…MB ktx2=…MB …`.

**Causa raiz encontrada com a instrumentação acima** (soak de 25 ciclos,
`fase-1`): `external` subia de 130 MB (5s de boot) a 459 MB (crash, ~2 min) —
bem mais rápido que qualquer coisa do heap gerenciado. O breakdown por fonte
isolou: `img` (decode de PNG cru, `image_decode.cpp`) crescia sem parar
(30 MB → 618 MB cumulativo em 68 chamadas), enquanto `ktx2` (pipeline de
textura do KIT, BC7) ficava **estável** desde a 1ª chamada — prova de que o
cache por URL do `SceneAssets` funciona bem para o kit, mas existe um SEGUNDO
caminho de imagem sem cache nenhum.

Logando dimensões por chamada, as duas fontes identificadas por comparação
direta com os arquivos do jogo:
- `assets/ui/loading-bg.png` (1672×941) — fundo da tela de loading, **2×** por
  entrada de fase.
- `assets/textures/waves_1.png` (2048×2048) — textura de cáusticas do `Water`
  component, **1×** por entrada de fase.

Ambas passam por `THREE.TextureLoader`/`RGBELoader`-equivalente → `FakeImage`
(`native/js/src/shims/image.js`, `Image.src` setter) → `__cortexDecodeImage`
(stb_image) — um caminho **sem cache**, diferente do `loadGLB`/`loadTexture`
do `SceneAssets` (cache por URL, SPEC-0152). Cada entrada de fase refaz
fetch+decode do zero, gerando um `ArrayBuffer` RGBA novo (6.3 MB + 16.8 MB por
ciclo) que nunca é coletado: o binding `hermes_napi` não consegue alimentar a
API de pressão do Hades (`creditExternalMemory` exige um `GCCell` específico;
`napi_adjust_external_memory` genérico só mantém um contador cosmético — visto
no comentário do próprio código upstream, `API/napi/hermes_napi.cpp`) — sem
nudge explícito (que só roda no `Game.reset()`, ADR-0153), o Hades não sente
pressão suficiente pra coletar esses `ArrayBuffer`s com a frequência que o
padrão de uso exige.

**Fix:** `FakeImage` (`image.js`) ganha um cache `Map<url, {width,height,rgba}>`
em escopo de módulo — mesmo padrão do `SceneAssets._texCache`. Na 2ª+ chamada
com a mesma URL, reusa o resultado decodificado (sem fetch, sem novo
`ArrayBuffer`). Plateia limitado ao nº de imagens únicas carregadas por esse
caminho no jogo inteiro (tipicamente poucas dezenas de KB a MB, não cresce com
o nº de vezes que uma tela é revisitada).

## Consequências

- Validado: soak de **40 ciclos** (60% acima do que crashava antes) roda
  limpo — `external` platô em ~130 MB (não sobe mais), `img` fixo em 5
  chamadas (não 68+). `error_log.txt` sem crash.
- O cache retém `rgba`/`width`/`height` pra sempre (mesmo padrão dos outros
  caches do engine) — não há despejo explícito equivalente a
  `clearSceneAssetCaches()` pra esse cache específico ainda; se algum dia isso
  importar (muitas imagens únicas via `Image`/`TextureLoader` num jogo maior),
  vale adicionar um `clearImageCache()` no mesmo ponto de troca de mundo.
- `pak`/`text` (rasterização de texto do HUD) ainda crescem devagar e
  linearmente no tempo (não platô) — pequeno o bastante pra não estourar o
  teto numa sessão normal (medido: ~33 MB de `text` em 4 min de soak
  contínuo), mas é o próximo candidato se uma sessão MARATONA (15-20 min,
  item já pendente desde a investigação de julho) mostrar problema.
- Sem teste automatizado: telemetria + fix validados por soak real (mesmo
  método do SPEC-0152), não há harness de unit test pro `native/js/`.
