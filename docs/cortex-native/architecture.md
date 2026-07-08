# CortexNative — arquitetura do host nativo

> **Fonte de verdade viva** do host nativo (`native/`). Leia a seção relevante
> ANTES de mexer; ATUALIZE na mesma mudança quando alterar fluxo, módulo ou
> descobrir armadilha nova. Manutenção é **AI-first**: este doc existe pra uma
> sessão de IA (ou um humano novo) pegar qualquer parte sem arqueologia.
>
> Contexto de produto: `docs/prds/0004-cortex-native-port-console-xbox.md`.
> Decisões de stack: `docs/adrs/0100-cortex-native-stack-do-host-m0.md`.

## O que é

Runtime nativo que executa o JavaScript do jogo **sem browser**:
Hermes (JS) + wgpu-native (WebGPU→D3D12) + SDL3. O JS enxerga a mesma API do
browser (`navigator.gpu`, `requestAnimationFrame`, timers) — é isso que vai
permitir rodar o Three.js WebGPURenderer sem fork. Alvo final: Xbox via GDK;
no PC, futuro export "nativo premium" (Tauri continua o caminho leve).

## Fluxo de um frame

```
main.cpp (loop)
 ├─ pollEvents            core/app_window   quit? resize? (reconfigura surface)
 ├─ runTimers             shims/timers      setTimeout/setImmediate vencidos
 ├─ drainMicrotasks       core/js_runtime   continuações de Promise/async
 ├─ runAnimationFrames    shims/animation_frame  callbacks de rAF (o JS grava
 │                                          e submete comandos WebGPU aqui)
 ├─ drainMicrotasks
 └─ presentIfAcquired     webgpu/surface    present + release da textura, se o
                                            JS chamou getCurrentTexture(). Com
                                            SSAA: blit downscale offscreen→swap.
```

Com SSAA ligado (padrão), o JS não desenha na swapchain: `getCurrentTexture`
devolve a textura **offscreen** (nativo × `renderScale`) e o `presentIfAcquired`
adquire a swapchain real, faz o blit downscale (webgpu/supersample) e apresenta.

No boot: `main` cria janela+surface (D3D12), cria `JsRuntime`, registra shims
e bindings, executa `boot.hbc` (bytecode) e drena microtasks — o `async main()`
do JS roda aí (pede adapter/device, cria pipeline, registra o 1º rAF).

## Mapa de módulos (quem faz o quê)

| Caminho | Responsabilidade |
|---|---|
| `native/src/main.cpp` | Composition root: liga módulos e roda o loop. Não contém lógica. |
| `native/src/core/host_gpu.h` | Estado gráfico compartilhado (instance, surface, device, config, textura do frame). Structs, sem comportamento. |
| `native/src/core/app_window.*` | SDL3: janela, instância WebGPU (D3D12 forçado), surface, eventos (quit/resize). |
| `native/src/core/js_runtime.*` | Ciclo de vida do Hermes (API C `jsr_*`), `print()`, boot `.hbc`→fallback `.js`, drain de microtasks. |
| `native/src/napi/napi_util.*` | Helpers Node-API genéricos (namespace `njs`): propriedades, wrap/unwrap de handles, chamadas JS com log de exceção. Zero dependência de WebGPU/SDL. |
| `native/src/shims/timers.*` | `setTimeout`/`clearTimeout`/`setImmediate`. O Hermes agenda async/await via `setImmediate` — obrigatório. |
| `native/src/shims/animation_frame.*` | `requestAnimationFrame` (uma geração de callbacks por frame; JS re-registra). |
| `native/src/shims/input.*` | Eventos SDL→JS (keydown/keyup/pointer via `__cortexDispatchInput`) + Gamepad API (`__cortexInput.getGamepads`, layout standard W3C sobre SDL_Gamepad). |
| `native/src/shims/files.*` | `__cortexReadFile` (fetch lê daqui). Tenta o `assets.pak` (via pak.*) e cai pro arquivo solto no disco (dev). SÓ leitura (assets). |
| `native/src/shims/user_storage.*` | `__cortexReadUserFile`/`__cortexWriteUserFile` — persistência GRAVÁVEL do usuário em `SDL_GetPrefPath(<jogo>, "saves")` (`<appdata>/<jogo>/saves/`). Único caminho de escrita; serve o shim de `localStorage` (ADR-0106). No console → XGameSave. |
| `native/src/shims/pak.*` | Leitor do container `assets.pak` (ADR-0104): parse header+índice, lê slice + desembaralha (XOR). Formato em sync com `native/scripts/pak.mjs`. |
| `native/src/shims/image_decode.*` | `__cortexDecodeImage` (stb_image → RGBA8) pro createImageBitmap. |
| `native/src/shims/rapier.*` | Ponte C ABI do crate rapier-native → `__rapierNative` (funções achatadas, f64). |
| `native/src/shims/audio.*` | `__cortexAudio`: decode (miniaudio) + playback (streams SDL3; loop/gain/pitch); `updateAudio()` por frame. |
| `native/src/shims/text_raster.*` | `__cortexRasterText` (stb_truetype + Roboto pinada) → bitmap RGBA branco pro RendererUiBackend (ADR-0102). |
| `src/ui/runtime/` (ENGINE) | UI de runtime ADR-0102: UiLayer/widgets/layout + DomUiBackend e RendererUiBackend. `uiFont.ts` embute a Roboto Medium (woff2, @font-face) pro DOM = mesma fonte do raster nativo (ADR-0103). Painel `fill` acompanha o viewport a cada frame (UiLayer). |
| `native/rapier-native/` | Crate Rust (cdylib): Rapier de verdade com C ABI mínima espelhando o que o engine usa. |
| `native/src/webgpu/bindings.h` | API pública do módulo: `registerBindings`, `presentIfAcquired`. Fora do módulo, só inclua este. |
| `native/src/webgpu/internal.h` | Contratos entre os .cpp do módulo (callbacks repartidos). |
| `native/src/webgpu/navigator.cpp` | `navigator.gpu` (requestAdapter, formato preferido) + dono do `gpuState()`. Registra o binding global `__cortexUiLayer(textureOrNull)` (ADR-0105): o JS entrega a textura da RT da UI pro host compor em gama. |
| `native/src/webgpu/device.cpp` | Aquisição do device, composição do objeto JS `device`, error scopes (push/popErrorScope). |
| `native/src/webgpu/pipeline.cpp` | Shader modules (WGSL) e render pipelines — sub-parsers por sub-estado (vertex/fragment/primitive/depth/multisample/layout). |
| `native/src/webgpu/layouts.cpp` | Bind group layouts e pipeline layouts explícitos (o Three não usa 'auto'). |
| `native/src/webgpu/buffers.cpp` | Recursos de DADOS: createBuffer (+mappedAtCreation/getMappedRange/unmap), writeBuffer (assinatura completa da spec, offsets em ELEMENTOS), createBindGroup, global `GPUBufferUsage`. |
| `native/src/webgpu/textures.cpp` | Recursos de IMAGEM: createTexture, views com descriptor (depth do Three), samplers. Marca `__kind` nos objetos p/ o parseBindGroupEntry. |
| `native/src/webgpu/commands.cpp` | Encoder, render pass (color+depth attachments), setBindGroup/setVertexBuffer/setIndexBuffer/viewport/scissor, draw/drawIndexed, queue.submit. |
| `native/src/webgpu/surface.cpp` | `gpuContext` (configure/getCurrentTexture) e present. Com SSAA, `getCurrentTexture` devolve a offscreen (SS) e o present faz o blit downscale. Com compositor de UI (ADR-0105), o present dispara por `ssaaPending` OU `uiPending` (menus rodam loop só-UI, sem render do jogo) e é gate por `gpu->device` (não `configured` — o menu não chama `context.configure`). |
| `native/src/webgpu/supersample.*` | SSAA (ADR-0103): alvo offscreen (nativo × `renderScale`) onde o JS desenha + pipeline de blit (fullscreen-triangle + sampler linear) que reduz pra swapchain no present. Mata o serrilhado do contorno inverted-hull. **Também COMPÕE a UI de runtime EM GAMA** (ADR-0105): amostra a textura da UI (`gpu->uiTexture`) e blenda sobre o jogo com `out = game·(1−a) + OETF(ui/a)·a` (= blend sRGB do DOM); `ensureOffscreen` força o offscreen quando há compositor de UI (pra rodar mesmo em `renderScale=1`). |
| `native/src/webgpu/enums.*` | Mapas string↔enum (formatos, compare, cull, vertex formats...). |
| `native/js/src/main.js` | Boot do jogo (hoje: cubo Three.js girando + smoke tests do M1). Entry do bundle. |
| `native/js/src/prelude.js` | Orquestrador dos shims JS (importa js/src/shims/ na ordem certa). Regra: o que dá pra shimar em JS fica em shims/. |
| `native/js/src/shims/globals.js` | self, console→print, performance. |
| `native/js/src/shims/event-target.js` | EventTarget-lite + Event/CustomEvent — o "event bus via document" que os jogos usam (rush:*). |
| `native/js/src/shims/dom-lite.js` | DOM inerte (createElement/appendChild/innerHTML rodam, nada renderiza) + window/document com bus próprio. Etapa 6a do M1. |
| `native/js/src/shims/webgpu-extras.js` | Constantes GPU*, features/limits no adapter/device, canvas fake. |
| `native/js/src/shims/input-bridge.js` | Redistribui eventos do host pra window/document/body (como o browser) e liga navigator.getGamepads ao nativo. |
| `native/js/examples/triangle.js` | Referência: triângulo WebGPU puro (Marcos C–D), sem Three. |
| `native/scripts/bundle.mjs` | esbuild (bundle es2018) + Babel (classes loose + arrows) → IIFE único pro hermesc. |
| `native/scripts/fetch-deps.ps1` | Baixa deps prebuilt **pinadas** (SDL3, wgpu-native, Hermes NuGet). |
| `native/scripts/export-game.mjs` | Export distribuível (ADR-0101): bundle+hermesc -O+exe+dlls+assets.pak → `<jogo>/dist-native/`. |
| `native/export-toolchain/` | Toolchain de export AUTO-CONTIDO (TDR-0003): `package.json`+`yarn.lock` pinados (esbuild/babel/three/three-mesh-bvh/zod) que o `bundle.mjs` usa em runtime. O CI instala e o electron-builder copia o `node_modules` pra `resources/node_modules` (só Windows), pro Studio empacotado exportar sem dev. |
| `native/scripts/pak.mjs` | Empacota uma pasta num container `.pak` (ADR-0104): índice binário + XOR leve. Formato em sync com `native/src/shims/pak.cpp`. |

## Regras do projeto (não quebrar)

1. **SOLID/clean code**: arquivo pequeno, responsabilidade única; condição de
   loop vira função nomeada (`isSurfaceTextureUsable`, `takeDueTimers`);
   parsing de descriptor grande vira sub-parsers (`parseVertexState`...).
2. **API fiel ao browser**: o JS nunca deve precisar saber que está no host.
   Nada de APIs "cortex-only" fora do namespace `gpuContext` (que simula a
   canvas — será substituído por um shim de canvas quando o Three entrar).
3. **Ownership de handles**: objeto JS embrulha handle via `napi_wrap` com
   finalizer que faz release no GC. Exceções NÃO-own (finalizeNoop): device e
   adapter (vivem no `HostGpu`, host libera no shutdown) e a textura da
   surface (host apresenta/libera 1x por frame em `presentIfAcquired`).
4. **Strings pra WGPUStringView**: a `std::string` precisa viver até a
   chamada wgpu (por isso os parsers recebem `std::string*` de fora).
5. **Deps pinadas** — nunca "latest". Atualização de versão é mudança
   deliberada (edite fetch-deps.ps1 e reteste os 3 marcos).

## Libs de terceiros no export nativo (regra de compatibilidade)

A promessa "o dev instala libs npm" continua, com a MESMA regra do React
Native (que roda milhares de libs sobre Hermes em produção):

- **JS puro funciona** (moment, dayjs, date-fns, lodash, uuid...) — sintaxe
  moderna é resolvida pelo pipeline (esbuild es2018 + Babel classes/arrows).
- **APIs de browser** funcionam SE estiverem nos shims (fetch, timers,
  TextDecoder, crypto...) — a lista cresce por demanda; faltou algo, é um
  shim novo, não um beco.
- **Não funcionam**: libs Node-only (fs/net), WASM, Intl pesado (Luxon;
  preferir dayjs/date-fns), e metaprogramação exótica (caso real: o CORE do
  zod v4 quebra no Hermes — resolvido trocando o runtime do engine pra
  `zod/v3` (subpath do próprio pacote v4), que roda no Hermes e valida DE
  VERDADE no host; o electron/Agent SDK segue no v4).
- Pendência de tooling: verificação de compatibilidade no BUILD (compilar a
  lib com hermesc + smoke) pra o dev descobrir na hora do bundle, não no
  console.

## Armadilhas conhecidas

- **FPS do gameplay é CPU-bound no RENDER (three.js WebGPU no Hermes), não na
  física nem no SSAA.** Medido no teste4 (fase-1, ~86 objetos): frame ~28ms →
  `world.tick` (física Rapier + scripts + ECS) ~3ms, **render ~20ms**, PostFX
  +4ms, UI ~2ms. O Studio (V8) faz o MESMO trabalho em ~13ms → 60-75fps; o
  native cai pra ~35 porque o Hermes (interpretador, sem JIT) roda o custo de
  CPU do WebGPURenderer (travessia da cena + avaliação de node materials +
  encoding por objeto) ~2× mais devagar. **Diagnóstico**: `CORTEX_RENDER_SCALE`
  1.0 vs 2.0 NÃO muda o FPS (⇒ não é fill de GPU) e present mode Mailbox também
  fica em ~35 (⇒ não é o cliff de meio-rate do vsync Fifo). **Alavancas** (todas
  reduzem o custo POR-FRAME de CPU do renderer, não a GPU): menos objetos
  (merge/instancing da geometria da fase), materiais mais simples, e desligar/
  reduzir o PostFX no native (~4ms/~6fps). Sombras quase não pesaram aqui (~1ms).
- **`wgpuInstanceWaitAny` → panic "not implemented"** (wgpu-native v29).
  Aquisição assíncrona SEMPRE com `AllowProcessEvents` + loop de
  `wgpuInstanceProcessEvents` (ver `acquireAdapter`/`acquireDevice`).
- **`setImmediate` ausente = async/await morto**: o Hermes (fila de jobs
  nativa inativa) agenda continuações via `setImmediate`. Sem o shim, o boot
  morre com `ReferenceError` depois do primeiro `await`.
- **O Hermes NÃO tem sintaxe `class`** (nem async arrows). Por isso o
  bundle.mjs roda Babel depois do esbuild: `plugin-transform-classes` em
  **loose** (o modo spec usa Reflect.construct e morre com "super() hasn't
  been called") + `plugin-transform-arrow-functions` **no mesmo passe**
  (se o esbuild rebaixar arrows antes, ele iça `var _this = this` pra antes
  do super() e o transform de classes quebra). NÃO usar `-Xes6-class` do
  hermesc: o bytecode exige um runtime compilado com a flag
  (`HermesES6Internal` não existe na hermes.dll da Microsoft).
- **Booleans JS não passam em `napi_get_value_double`**: flags de descriptor
  (`mappedAtCreation`, `depthWriteEnabled`...) SEMPRE via `njs::getNamedBool`
  — foi bug real (buffer nunca mapeado → panic no getMappedRange).
- **`writeBuffer` tem 5 argumentos** na spec: (buffer, bufferOffset, data,
  dataOffset, size) com dataOffset/size em **elementos** do TypedArray.
  O Three usa todos — ignorar os dois últimos estoura o buffer.
- **`SDL_SetMainReady`/`SDL_main.h`**: não usamos; `main` puro funciona no
  SDL3. Incluir `SDL_main.h` redefine `main` e quebra o link.
- **hermes.exe é x86** (roda via WOW64) — caminho `tools/native/release/x86`.
  O bytecode gerado é portátil; a dll do runtime é x64.
- **vcvars64 obrigatório** pro CMake/Ninja acharem o `cl.exe` (Build Tools
  em `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools`).
- **Color space do swapchain**: o browser SEMPRE reporta o formato de canvas
  SEM `-srgb` (o Three converte gamma no shader). O wgpu-native reporta
  `bgra8unorm-srgb` como preferido → aceitar isso causa DUPLA conversão sRGB
  (iluminação/gamma erradas). `getPreferredCanvasFormat` faz `stripSrgb`
  (navigator.cpp) pra igualar o browser.
- **UI NÃO pode passar pelo tone mapping do jogo** (cores do menu "lavadas/frias"
  no export): a UI de runtime (RendererUiBackend) desenha pela MESMA
  câmera/renderer do jogo, que tem `ACESFilmicToneMapping` ligado
  (`outdoorLighting`). Cor de INTERFACE é sRGB autorada, NÃO cena — o ACES
  esfria/dessatura. Fix: **`material.toneMapped = false`** nos três materiais da
  UI (box do painel, texto, imagem) — inclusive no `colorNode` custom do painel
  (MeshBasicNodeMaterial), onde FUNCIONA (validado medindo o export). NÃO
  alternar `renderer.toneMapping` por frame: além de desnecessário, arrisca
  recompile de shader → FPS. No DOM (Studio) não ocorre (CSS puro). **Além
  disso:** a opacidade dos widgets tem que casar com o DOM — botão com
  `fillOpacity` < 1 deixa o backdrop claro vazar e LAVA a cor (era um `*0.96`
  fantasma). Regressão travada em `tests/ui/RendererUiBackend.test.ts`
  (toneMapped=false + opacidade).
- **Blend de TRANSPARÊNCIA da UI: linear no native vs sRGB no DOM** (ADR-0105).
  O `WebGPURenderer` do Three blenda num buffer linear interno; o CSS/DOM
  (DomUiBackend, Studio) compõe em sRGB/gama. Medido: scrim `#0a2a3c`@0.6 sobre
  branco = **(170,172,175)** no native (linear) vs **(108,127,138)** no Chrome
  (sRGB). Só translúcidos divergem (opacity < 1: scrim, overlays, botão
  desabilitado); cor OPACA é bit-idêntica. Por isso os menus de resultado/pausa
  saíam "com muito brilho/pouco contraste" no native. NÃO é MSAA/SSAA/HDR/ICC (o
  monitor é sRGB puro; Chrome faz identidade). **RESOLVIDO (ADR-0105):** a UI de
  runtime vai pra uma **RenderTarget própria** do three (escreve LINEAR, sem OETF,
  sem tocar estado global do renderer) e o **blit compõe EM GAMA** sobre o jogo
  (`out = game·(1−a) + OETF(ui/a)·a` — supersample.cpp). O engine entrega a textura
  da RT via `__cortexUiLayer` (navigator.cpp). Medido: scrim (170,172,175)→(108,127,138)
  = DOM; opacos bit-exatos; jogo intacto. **ARMADILHA (tentativa 1 falhou):** togglar
  `outputColorSpace` por frame pra pular o OETF NÃO funciona — o three faz o OETF num
  passe de saída do FRAME INTEIRO (buffer de trabalho linear), então togglar escurece o
  JOGO (o cache de pipeline do host serve o shader do jogo sem OETF de forma
  persistente). Regra geral: **nunca togglar estado global do renderer por frame** (vale
  pra `outputColorSpace`, `toneMapping`, etc. — vaza pro jogo via os caches three×host).
- **MSAA precisa de `resolveTarget`**: com `antialias:true`, o Three renderiza
  numa textura multisampled e resolve pro swapchain via `resolveTarget` no
  color attachment. Sem parsear esse campo (commands.cpp), o antialias vira
  no-op → serrilhado nas bordas.
- **Fullscreen + `SDL_SyncWindow`**: o host abre em fullscreen na resolução
  do desktop (sharp, tamanho fixo). Pega o tamanho de
  `SDL_GetDesktopDisplayMode` (`w * pixel_density`), NÃO de
  `SDL_GetWindowSizeInPixels` — este devolve o tamanho inicial da janela até
  a transição assentar. E chama `SDL_SyncWindow(window)` logo após criar:
  sem ele, o engine cria os alvos a 1280×720 (tamanho de criação) enquanto a
  swapchain assume a resolução do display (1920×1080) → mismatch depth×color
  → crash. `CORTEX_WINDOWED=1` abre em janela pra debug.
- **Reconfigurar a surface = CRASH** ("Invalid surface" no wgpuSurfaceConfigure,
  D3D12/wgpu-native): a PRIMEIRA config funciona; qualquer RE-config pra um
  tamanho diferente (resize/maximizar) crasha o processo — nem recriar a
  surface, `wgpuDevicePoll`, ou `getCapabilities` resolvem. Por isso a janela
  é de **tamanho FIXO** (`SDL_CreateWindow` sem `SDL_WINDOW_RESIZABLE`): a
  surface configura UMA vez e nunca mais. `configureSurface` só é chamado na
  1ª vez e na recuperação de Outdated/Lost (sempre pro MESMO tamanho).
  Consequência: sem resize/maximizar e **sem high-DPI** (a flag
  `HIGH_PIXEL_DENSITY` também dependia de re-config). O host injeta o tamanho
  fixo no JS (`__cortexWidth/Height`) antes do boot. Nitidez em monitor com
  escala: resolvida de graça pelo **SSAA** (canvas maior; ver abaixo).
- **SSAA usa o modelo de dpr do browser** (ADR-0103), NÃO um innerWidth
  inflado. O host injeta `innerWidth/Height = nativo` (px lógicos) +
  `devicePixelRatio = renderScale`; o three multiplica logical × dpr pro backing
  (= offscreen SS = `gpu.width × renderScale`). Assim o depth (backing) casa com
  o color (offscreen) e a UI, que faz layout em px lógicos, NÃO encolhe.
  - Tentativa 1 (abandonada): `innerWidth = SS`, dpr=1. Casava depth×color mas
    a UI (px absolutos num canvas SS) ficava minúscula depois do downscale.
  - O viewport da UI (`Game.ts`) tem que ser o tamanho LÓGICO
    (`renderer.width/height` = `getSize()`), não `canvas.width` (backing = SS).
  - `__cortexResize` passa o tamanho LÓGICO (nativo); o dpr persiste no three e
    leva pro SS. Passar SS aqui dobraria a escala.

- **SSAA: presente SÓ quando o JS renderizou o frame** (`ssaaPending` em
  host_gpu.h). O `offscreenView` é persistente; se o present blitasse todo frame
  (checando só `offscreenView != null`), o vsync travaria o host em ~60fps MESMO
  sem frame novo — serializando trabalho assíncrono que renderiza pouco (uma
  carga de ~0,7s virava ~18s). `getCurrentTexture` marca `ssaaPending=true`; o
  `presentIfAcquired` só blita/apresenta se está marcado (e limpa). Foi o que
  fazia o "menu congelado mó tempão": o menu criava o offscreen e o `buildScene`
  seguinte ficava gated a 60fps.
- **`cancelAnimationFrame` é obrigatório** (não só `requestAnimationFrame`): o
  `game.stop()`/`GameLoop.stop()` o chama; sem ele dava `ReferenceError` e
  ABORTAVA o teardown de cena (trocar de fase/voltar ao menu). O shim
  (animation_frame.cpp) devolve um id no rAF e o cancela por id.
- **Loop de render durante carga = carga MAIS LENTA** (present = vsync). O loop
  principal do host só bloqueia no `wgpuSurfacePresent` (FIFO/vsync) QUANDO algo
  desenhou no frame; sem render, ele gira livre e pompa timers/microtasks (onde
  o carregamento assíncrono avança) na velocidade máxima. Por isso a tela de
  loading (`runWithLoadingScreen`) desenha SÓ nas trocas de etapa: renderizar
  todo quadro travaria o host em 60 fps e serializaria o `buildScene` (carga de
  ~1,5 s virava ~25 s). O último quadro apresentado fica na tela no intervalo.

## Superfície WebGPU coberta (2026-07-06)

O shim cobre a API que o Three.js WebGPURenderer usa, incluindo:
- **Render**: pipelines (render/compute, + versões async), bind group/pipeline
  layouts explícitos, render pass (color+depth, viewport/scissor,
  draw/drawIndexed, index/vertex buffers), **render bundles**
  (createRenderBundleEncoder/executeBundles — o three gera **mipmaps** com
  eles; sem isso, environment/skybox quebram) e **compute pass**
  (beginComputePass/dispatchWorkgroups).
- **Recursos**: buffers (map/mapAsync/getMappedRange, size/usage), texturas
  (createTexture com width/height/format/mip/sampleCount expostos; views com
  descriptor; samplers), copies (buffer↔buffer, texture↔texture,
  writeTexture, copyExternalImageToTexture).
- **Sinais**: onSubmittedWorkDone, popErrorScope (resolvem sincronamente — o
  host submete/apresenta no mesmo frame).

**Imagens/texturas** (fora do WebGPU): `Image`/`HTMLImageElement` fake
(shims/image.js) — fetch+stb_image, herda de ImageBitmap; é o que faz o
TextureLoader (skybox, environment, cáusticas, backgrounds) funcionar.
Sem ele, TODA textura por URL falhava em silêncio (água/céu sumiam).

**Impossíveis por design (não são shim)**: JIT/eval, WASM (por isso Rapier
é nativo), DOM real com layout/CSS (a UI é a de runtime, ADR-0102). Deltas
visuais restantes são de RENDER (wgpu-native vs Dawn), não de API — o
environment default (IBL do céu) foi adicionado no engine (SceneBuilder)
porque metais ficavam pretos sem ele, o que divergia entre preview e export.

## Como estender (receitas)

**Expor uma API WebGPU nova pro JS** (ex.: `createBuffer`):
1. Escolha o arquivo por responsabilidade (recursos → `device.cpp`;
   gravação → `commands.cpp`; apresentação → `surface.cpp`).
2. Escreva o callback `napi_value fn(napi_env, napi_callback_info)` usando
   `njs::` (unwrapThis pro handle nativo, getNamed* pro descriptor).
3. Enum novo em string? Adicione o par em `enums.*`.
4. Anexe com `njs::setMethod` no objeto certo (device/encoder/pass).
5. Compartilhado entre .cpp? Declare em `internal.h`.
6. Exercite no `boot.js`, recompile (o `.hbc` regenera sozinho) e rode.
7. Atualize a tabela acima se criou arquivo novo.

**Shim de browser novo** (ex.: `performance.now`): arquivo novo em `shims/`
com par `register*()`/`run*()` se precisar de tick do loop; registre no
`main.cpp`.

## Build & run

```powershell
powershell -File native/scripts/fetch-deps.ps1   # 1x (baixa deps pinadas)
# num prompt com vcvars64:
cmake -G Ninja -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
native/build/cortex_host.exe
```

Saída esperada hoje (M0, Marco C): janela com triângulo violeta, e no console
`[js] [boot] pipeline criado — WGSL compilado no backend D3D12`.

**Env vars do host** (export/atalho ou debug):
- `CORTEX_WINDOWED=1` — abre em janela (padrão é fullscreen na resolução do desktop).
- `CORTEX_RENDER_SCALE=<n>` — fator de SSAA (ADR-0103). Padrão `2.0`; `1.0`
  desliga; teto `4.0`. Regula nitidez do contorno × custo de fill-rate.
- `CORTEX_LAUNCH_QUERY=<query>` — vira `location.search` (deep-link de fase, ex.:
  `?level=fase-1`); vazio = fluxo normal (menu).

## Estado e próximos marcos

**M0 CONCLUÍDO em 2026-07-05** — conceito CortexNative validado de ponta a
ponta: Three.js WebGPURenderer renderizando cubo girando (MeshNormalMaterial,
depth, perspectiva) em bytecode Hermes sobre D3D12, sem browser.

- ✅ A: janela SDL3 + clear via WebGPU nativo (D3D12)
- ✅ B: Hermes embutido (bytecode .hbc), JS comanda o frame
- ✅ C: triângulo WGSL 100% definido em JS via navigator.gpu
- ✅ D: vertex buffer + uniform + bind group (triângulo girando)
- ✅ E: **cubo do Three.js girando** — bundle esbuild+Babel do three/webgpu,
  prelude de shims JS, layouts explícitos, depth texture, index buffer,
  viewport/scissor, mapeamento de buffer, error scopes

Limitações conhecidas: mapAsync (readback) e copyTextureToTexture não
existem; MSAA não testado.

**M1 — engine cortex completo no host**, validado com o jogo real teste4.
Plano completo com inventário e ordem de ataque:
`docs/cortex-native/m1-inventario-teste4.md`. Estado:
- ✅ Frente 1 — event bus (CustomEvent via document) + DOM-lite inerte
- ✅ Frente 2 — input: keydown/keyup/pointer SDL→JS (validado com tecla real)
  + Gamepad API standard sobre SDL_Gamepad
- ✅ Frente 3 — fetch/assets: GLB do kit do teste4 renderizado COM textura
  (files.cpp + stb_image + writeTexture/copyExternalImageToTexture +
  TextDecoder/atob/Blob/createImageBitmap em JS)
- ✅ Frente 4 (core) — Rapier NATIVO: crate Rust `native/rapier-native`
  (C ABI achatada, scratch compartilhado) + shims/rapier.cpp + adaptador
  `rapier-compat.js` com a forma da API compat (o bundle aponta o import
  do @dimforge/rapier3d-compat pra ele). Smoke: bola repousa no chão.
  **Pendências**: DynamicRayCastVehicleController (carro) e
  setAdditionalMassProperties — lança erro claro se usados.
- ✅ Frente 5 — áudio: decode via miniaudio (wav/mp3/flac, pinado) +
  playback por streams SDL3 (gain/pitch nativos, loop realimentado por
  frame); WebAudio-lite em JS com a forma que o THREE.Audio usa.
  **Pendência**: espacialização do PannerNode (PositionalAudio toca sem 3D).
- ✅ Frente 6 — **UI de runtime (ADR-0102) implementada e provada no jogo**:
  `src/ui/runtime/` no ENGINE (UiLayer + Panel/Label/Button ancorados, foco
  d-pad/setas NA API, `game.ui`) com DomUiBackend (Studio) e
  RendererUiBackend (host: cena ortográfica + `__cortexRasterText` via
  stb_truetype/Roboto pinada; **descarte de textura ADIADO 2 frames** —
  dispose imediato derruba o frame em voo). teste4 migrado (MainMenu +
  HUD do RushSystem): menu navegável e HUD ao vivo no host (screenshots).
  LoadingScreen (createLoadingScreen) e DialogueUI (createUiDialogueUI +
  opção `ui` no startDialogue — escolhas navegáveis por d-pad/A) migrados;
  Speedometer fica pós-M1 JUNTO do vehicle controller (só tem uso com carro
  e precisa de widget de imagem/rotação). Pendência menor: texto maior que
  o botão não recorta.

**TESTE PRÁTICO (2026-07-05): o teste4 REAL é JOGÁVEL no host.** Pipeline:
`node native/scripts/bundle.mjs <out> D:/jogos/teste4/main.ts` (CORTEX_LEVEL
opcional pula o menu) → hermesc → `cortex_host.exe D:\jogos\teste4`.
Menu nativo navegável → fase com visual COMPLETO (texturas embutidas via
URL/objectURL; blend ok) → HUD ao vivo (moedas/cronômetro).

**M1 CONCLUÍDO (2026-07-06).** Export empacotado:
`node native/scripts/export-game.mjs <gameDir>` → `<gameDir>/dist-native/`
com `<jogo>.exe` + dlls + Roboto + boot.hbc (-O) + assets/ + scenes/*.json —
validado: teste4.exe roda STANDALONE da pasta dist. Re-vendor de projeto:
build:engine completo + tsc → copiar dist-engine/* e .d.ts conforme
VENDOR_TYPE_MODULES (o teste4 já recebeu os tipos da UI).
Pós-M1 (feito): **save persistente no host** — `localStorage` sobre
`user_storage.*` (`SDL_GetPrefPath`), ADR-0106. O `SaveGame` do teste4
(progressão da spec 0003) agora persiste entre sessões no `.exe`.
Pós-M1 (feito): **export nativo embarcado no Studio Windows** (TDR-0003) — o
`.exe` instalado exporta nativo sem dev. O host compilado + o toolchain de
export auto-contido (`native/export-toolchain/`) + o `src/` da engine vão no
instalador via `electron-builder.json#win.extraResources`; o CI (composite
`.github/actions/build-native-host`) compila o host no runner Windows
(Rust+MSVC+Ninja/CMake → `fetch-deps` → `cargo` → `cmake`) antes do
`electron:build`. macOS/Linux ficam sem export nativo (host é D3D12/Windows).
Pós-M1 (aberto): Speedometer+vehicle controller; espacialização do Panner;
mapAsync/copyTextureToTexture/MSAA; instalador (NSIS/MSIX) pro dist;
persistência no CONSOLE (trocar o backend de user_storage por XGameSave).

Build do Rapier nativo: `cargo build --release` em `native/rapier-native/`
(1x; o CMake linka `target/release/rapier_native.dll.lib` e copia a dll).
