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
 └─ splashPending()?      webgpu/splash     nos ~1,9s iniciais a splash da engine
    ├─ sim: splashFrame                     é a ÚNICA a apresentar (ADR-0109) —
    │                                       o frame do jogo é DESCARTADO.
    └─ não: presentIfAcquired  webgpu/surface  present + release da textura, se o
                                            JS chamou getCurrentTexture(). Com
                                            SSAA: blit downscale offscreen→swap.
```

Com SSAA ligado (padrão), o JS não desenha na swapchain: `getCurrentTexture`
devolve a textura **offscreen** (nativo × `renderScale`) e o `presentIfAcquired`
adquire a swapchain real, faz o blit downscale (webgpu/supersample) e apresenta.

No boot: `main` cria janela+surface (D3D12), cria `JsRuntime`, registra shims
e bindings, injeta globais pré-boot (`__cortexSearch`,
`__cortexWidth/Height/PixelRatio` e `__cortexLocale` — idioma do SO via
`SDL_GetPreferredLocales`, que o shim espelha em `navigator.language` pro i18n,
SPEC-0124), executa `boot.hbc` (bytecode) e drena microtasks — o `async main()`
do JS roda aí (pede adapter/device, cria pipeline, registra o 1º rAF).

**A splash não pode rodar antes disso**: o `WGPUDevice` só nasce quando o JS
pede (`navigator.gpu`), então `splashFrame` espera o device aparecer e só aí
começa a contar seus ~1,9 s — cobrindo justamente a carga do jogo. Enquanto ela
está no ar é a **única a apresentar**, e o frame do jogo é descartado. Apresentar
os dois no mesmo vsync faz o jogo vazar entre os frames e a splash piscar.
Ver ADR-0109.

## Mapa de módulos (quem faz o quê)

| Caminho | Responsabilidade |
|---|---|
| `native/src/main.cpp` | Composition root: liga módulos e roda o loop. Não contém lógica. |
| `native/src/core/host_gpu.h` | Estado gráfico compartilhado (instance, surface, device, config, textura do frame). Structs, sem comportamento. |
| `native/src/core/app_window.*` | SDL3: janela, instância WebGPU (D3D12 forçado), surface, eventos (quit/resize). |
| `native/src/core/game_config.*` | Identidade do jogo lida do `cortex.json` ao lado do exe (ADR-0126): `loadGameConfig(baseDir, fallbackSlug)` → `{ id, name }`. `id` = slug estável → **pasta de saves** (não é o nome do exe, que no export é fixo `launcher.exe`); `name` = exibição → **título da janela** (`SDL_SetWindowTitle`). Extrator mínimo de campo string do JSON plano (sem lib JSON). Fallback pro basename quando o campo falta. |
| `native/src/core/js_runtime.*` | Ciclo de vida do Hermes **UPSTREAM** (facebook/hermes via `hermes_embed`, ADR-0122 — o fork MS/`jsr_*` foi aposentado: ~4× mais lento), `print()`, boot `.hbc`→fallback `.js`, drain de microtasks, global `__cortexGC()` (coleta sob demanda no teardown de fase — ADR-0153). ⚠️ `JsRuntime::HandleScope`: TODO acesso NAPI vindo do NATIVO exige scope aberto (o loop abre 1/frame; boot tem o seu) — sem isso o GC corrompe na marcação. |
| `native/src/core/crash_handler.*` | `SetUnhandledExceptionFilter` + DbgHelp: segfault imprime **backtrace simbolizado** no stderr (com PDB dá arquivo:linha) em vez de exit mudo. Foi o que caçou o bug do handle-scope. |
| `native/src/core/hermes_embed.*` | ÚNICO tradutor que inclui headers do VM do Hermes: API C mínima (create runtime/env, run bytecode/script, drain jobs). Compilado num alvo que herda as flags EXATAS do build do Hermes (`hermesNapi_obj`) — headers do VM com defines diferentes quebram ABI em silêncio. O Hermes builda como SUBPROJETO (`third_party/hermes-upstream/src`, commit pinado pelo fetch-deps) e é ESTÁTICO no exe (sem hermes.dll). |
| `native/src/shims/perf_stats.*` | `__cortexPerfStats()` → CPU % do processo, working set MB e VRAM MB (DXGI) — alimenta o `DebugHud` do engine no export `--debug`. |
| `native/src/core/gdk.*` | App model do Microsoft GDK (M3): `initGameRuntime`/`shutdownGameRuntime` (XGameRuntime). **No-op** sem `-DCORTEX_GDK`; com o flag, linka `xgameruntime.lib` e inicializa o runtime do GDK. Base p/ XUser/XGameSave/suspend-resume e alvos de console. O `main.cpp` injeta **`__cortexPlatform`** (`"xbox"` com o flag, senão `"pc"`) pré-boot — os jogos dimensionam custo por alvo (ex.: teste4 baixa o shadow map do CSM 4096²→2048² no console, Series S). |
| `native/src/core/steam.*` | Integração Steamworks (release PC/Steam): `initSteam` (relaunch-via-Steam + `SteamAPI_Init`) / `runSteamCallbacks` (por frame) / `shutdownSteam`. **No-op** sem `-DCORTEX_STEAM`; com o flag, linka `steam_api64`. Base p/ overlay/conquistas/cloud. Irmão do `gdk.*` (Steam no PC ↔ GDK no console, mesma arquitetura). |
| `native/src/napi/napi_util.*` | Helpers Node-API genéricos (namespace `njs`): propriedades, wrap/unwrap de handles, chamadas JS com log de exceção. Zero dependência de WebGPU/SDL. |
| `native/src/shims/timers.*` | `setTimeout`/`clearTimeout`/`setImmediate`. O Hermes agenda async/await via `setImmediate` — obrigatório. |
| `native/src/shims/animation_frame.*` | `requestAnimationFrame` (uma geração de callbacks por frame; JS re-registra). |
| `native/src/shims/input.*` | Eventos SDL→JS (keydown/keyup/pointer via `__cortexDispatchInput`) + Gamepad API (`__cortexInput.getGamepads`, layout standard W3C sobre SDL_Gamepad). |
| `native/src/shims/files.*` | `__cortexReadFile` (fetch lê daqui). Tenta o `assets.pak` (via pak.*) e cai pro arquivo solto no disco (dev). Leitura de assets + `__cortexWriteBaseFile` (SPEC-0124): escrita de TEXTO na raiz da pasta do jogo, nome sanitizado (sem `/ \ : ..`) — caso de uso: `config.ini` do GameConfig. Pode falhar em pasta read-only (retorna false; o JS trata). |
| `native/src/shims/user_storage.*` | `__cortexReadUserFile`/`__cortexWriteUserFile` — persistência GRAVÁVEL do usuário; serve o shim de `localStorage` (SPEC-0106). Resolve a pasta de save: com `-DCORTEX_GDK` tenta **XGameSave** (`XUser` + `XGameSaveFilesGetFolderWithUi`, por-usuário + sync na nuvem) quando há usuário assinado + SCID (`CORTEX_SCID`); senão cai pro arquivo `SDL_GetPrefPath(<id>, "saves")` — onde `<id>` vem do `cortex.json` (game_config, ADR-0126), **não** do nome do exe (fixo `launcher.exe`). É file I/O comum na pasta resolvida. |
| `native/src/shims/pak.*` | Leitor do container `assets.pak` (ADR-0104): parse header+índice, lê slice + desembaralha (XOR). Formato em sync com `native/scripts/pak.mjs`. |
| `native/src/shims/image_decode.*` | `__cortexDecodeImage` (stb_image → RGBA8) pro createImageBitmap. |
| `native/src/shims/ktx2.*` | `__cortexTranscodeKtx2` (basis_universal transcoder → RGBA8) pra texturas KTX2/Basis (ADR-0108, Fase 1). Espelha o image_decode; reusa o upload RGBA. Lib em `third_party/basisu/` (só `transcoder/`, pinada) + `third_party/zstd/` (zstddeclib single-file do próprio basis) — o build liga `BASISD_SUPPORT_KTX2_ZSTD=1` porque o cook gera **UASTC+RDO+Zstd** pra cor (ADR-0119; ETC1S bandava os atlas de gradiente dos kits). |
| `native/src/shims/quit.*` | `__cortexQuit()` (SPEC-0120): encerramento pedido pelo JOGO — empurra `SDL_EVENT_QUIT` na fila, o loop encerra pelo MESMO teardown do fechar-janela. O dom-lite mapeia `window.close()` pra cá. |
| `native/src/shims/rapier.*` | Ponte C ABI do crate rapier-native → `__rapierNative` (funções achatadas, f64). |
| `native/src/shims/audio.*` | `__cortexAudio`: decode (miniaudio) + playback (streams SDL3; loop/gain/pitch); `updateAudio()` por frame. |
| `native/src/shims/text_raster.*` | `__cortexRasterText` (stb_truetype + Roboto pinada) → bitmap RGBA branco pro RendererUiBackend (ADR-0102). |
| `src/ui/runtime/` (ENGINE) | UI de runtime ADR-0102: UiLayer/widgets/layout + DomUiBackend e RendererUiBackend. `uiFont.ts` embute a Roboto Medium (woff2, @font-face) pro DOM = mesma fonte do raster nativo (ADR-0103). Painel `fill` acompanha o viewport a cada frame (UiLayer). **DOM-lite com nomes do HTML5 (ADR-0123)**: `background` aceita `linear-gradient(180deg\|90deg,…)` e cores com alpha (`uiColor.ts` decompõe pro shader — THREE.Color não tem alpha), `boxShadow` duro (`"0 Npx 0 cor"`, segunda malha), `borderRadius`/`textAlign`, borda constante em botão, imagem clipada pelo raio (SDF) e tags `<div>/<span>/<img>` no template. Ordem de pintura por widget = `order*4` (sombra<caixa<imagem<texto). |
| `native/rapier-native/` | Crate Rust (cdylib): Rapier de verdade com C ABI mínima espelhando o que o engine usa. |
| `native/src/webgpu/bindings.h` | API pública do módulo: `registerBindings`, `presentIfAcquired`. Fora do módulo, só inclua este. |
| `native/src/webgpu/internal.h` | Contratos entre os .cpp do módulo (callbacks repartidos). |
| `native/src/webgpu/navigator.cpp` | `navigator.gpu` (requestAdapter, formato preferido) + dono do `gpuState()`. Registra o binding global `__cortexUiLayer(textureOrNull)` (ADR-0105): o JS entrega a textura da RT da UI pro host compor em gama. |
| `native/src/webgpu/device.cpp` | Aquisição do device, composição do objeto JS `device`, error scopes (push/popErrorScope). |
| `native/src/webgpu/pipeline.cpp` | Shader modules (WGSL) e render pipelines — sub-parsers por sub-estado (vertex/fragment/primitive/depth/multisample/layout). |
| `native/src/webgpu/layouts.cpp` | Bind group layouts e pipeline layouts explícitos (o Three não usa 'auto'). |
| `native/src/webgpu/buffers.cpp` | Recursos de DADOS: createBuffer (+mappedAtCreation/getMappedRange/unmap), writeBuffer (assinatura completa da spec, offsets em ELEMENTOS), createBindGroup, global `GPUBufferUsage`. ⚠️ `destroy()` de buffer/textura é **DESTRUIÇÃO ADIADA** (ADR-0153, 2ª rodada): enfileira com `wgpu*AddRef` (segura a fila contra o finalizer do GC — sem isso o destroy adiado virava use-after-free) e o `flushDeferredDestroys` do loop executa `Destroy`+`Release` 10 frames depois — fora da janela de passes em voo que fazia o destroy imediato dar PANIC ("has been destroyed", intermitente em fullscreen). O release-only anterior deixava a VRAM presa (refs internas do wgpu seguravam mesmo com finalizers rodando; ~770 MB POR troca de fase no soak). Telemetria de VRAM: `CORTEX_VRAM_LOG=1` imprime criação×destroy×release + texturas vivas com dimensões. **A coleta é determinística na troca de fase** (ADR-0153): os wrappers são objetos JS minúsculos segurando MBs nativos, o GC não sente pressão e podia nunca rodar — o `Game.reset()` do engine chama o global `__cortexGC()` (registrado em `js_runtime.cpp` → `Runtime::collect`), que roda os finalizers e devolve VRAM/RAM atrás da tela de loading. |
| `native/src/webgpu/textures.cpp` | Recursos de IMAGEM: createTexture, views com descriptor (depth do Three), samplers. Marca `__kind` nos objetos p/ o parseBindGroupEntry. |
| `native/src/webgpu/commands.cpp` | Encoder, render pass (color+depth attachments), setBindGroup/setVertexBuffer/setIndexBuffer/viewport/scissor, draw/drawIndexed, queue.submit. |
| `native/src/webgpu/surface.cpp` | `gpuContext` (configure/getCurrentTexture) e present. Com SSAA, `getCurrentTexture` devolve a offscreen (SS) e o present faz o blit downscale. Com compositor de UI (ADR-0105), o present dispara por `ssaaPending` OU `uiPending` (menus rodam loop só-UI, sem render do jogo) e é gate por `gpu->device` (não `configured` — o menu não chama `context.configure`). |
| `native/src/webgpu/supersample.*` | SSAA (ADR-0103): alvo offscreen (nativo × `renderScale`) onde o JS desenha + pipeline de blit (fullscreen-triangle + sampler linear) que reduz pra swapchain no present. Mata o serrilhado do contorno inverted-hull. **Também COMPÕE a UI de runtime EM GAMA** (ADR-0105): amostra a textura da UI (`gpu->uiTexture`) e blenda sobre o jogo com `out = game·(1−a) + OETF(ui/a)·a` (= blend sRGB do DOM); `ensureOffscreen` força o offscreen quando há compositor de UI (pra rodar mesmo em `renderScale=1`). |
| `native/src/webgpu/splash.*` | Splash OBRIGATÓRIA da engine (ADR-0109): a marca TS Cortex Studio nos ~1,9 s iniciais (fade-in 350 / hold 1100 / fade-out 450), cobrindo a carga do jogo. Só começa quando o `device` — pedido pelo JS — existe. Enquanto `splashPending()`, ela substitui o `presentIfAcquired` e **descarta** o frame do jogo (`discardGameFrame`): dois presents no mesmo vsync faziam o jogo vazar e a splash piscar. Se o decode/pipeline falhar, desliga-se sozinha e o jogo segue. `CORTEX_NO_SPLASH=1` só vale no dev-run (com `argv[1]`). |
| `native/src/brand/splash_png.h` | PNG da marca EMBUTIDO no binário (nada de arquivo removível ao lado do exe). Gerado de `brand/*.svg` por `native/scripts/gen-brand.mjs` — **não edite à mão**. |
| `native/src/webgpu/enums.*` | Mapas string↔enum (formatos, compare, cull, vertex formats...). |
| `native/js/src/main.js` | Boot do jogo (hoje: cubo Three.js girando + smoke tests do M1). Entry do bundle. |
| `native/js/src/prelude.js` | Orquestrador dos shims JS (importa js/src/shims/ na ordem certa). Regra: o que dá pra shimar em JS fica em shims/. |
| `native/js/src/shims/globals.js` | self, console→print, performance. |
| `native/js/src/shims/event-target.js` | EventTarget-lite + Event/CustomEvent — o "event bus via document" que os jogos usam (rush:*). |
| `native/js/src/shims/dom-lite.js` | DOM inerte (createElement/appendChild/innerHTML rodam, nada renderiza) + window/document com bus próprio. Etapa 6a do M1. `window.close()` → `__cortexQuit` (SPEC-0120; sem host = no-op, como aba de browser). |
| `native/js/src/shims/webgpu-extras.js` | Constantes GPU*, features/limits no adapter/device, canvas fake. |
| `native/js/src/shims/input-bridge.js` | Redistribui eventos do host pra window/document/body (como o browser) e liga navigator.getGamepads ao nativo. |
| `native/js/examples/triangle.js` | Referência: triângulo WebGPU puro (Marcos C–D), sem Three. |
| `native/scripts/bundle.mjs` | esbuild (bundle es2018) + Babel (classes loose + arrows) → IIFE único pro hermesc. |
| `native/scripts/fetch-deps.ps1` | Baixa deps prebuilt **pinadas** (SDL3, wgpu-native, stb, basisu, NSIS, clone do Hermes upstream + patches). O encoder Basis (WASM) é delegado ao `fetch-basis-encoder.mjs`. |
| `native/scripts/fetch-basis-encoder.mjs` | Baixa o **encoder** basis_universal (WASM, pinado) pra `native/tools/basis-encoder/` — dep do `encode-ktx2.mjs`. Node multiplataforma de propósito: o job de testes do CI (ubuntu) roda ele antes do `yarn test` pros testes de política ADR-0119 não pularem (TDR-0004). |
| `native/scripts/export-game.mjs` | Export distribuível (ADR-0101): bundle+hermesc -O+exe+dlls+assets.pak → `<jogo>/dist-native/`. O exe é **fixo `launcher.exe`** e o nome/id do jogo vêm do `cortex.json` (ADR-0126, `game-config.mjs`) — grava um `cortex.json` **resolvido** (id/name garantidos) no dist. Também copia soltos (fora do pak): `config.ini` e `languages/*.txt` (i18n editável sem rebuild, SPEC-0124). |
| `native/scripts/game-config.mjs` | `readGameConfig(gameDir)` — resolve `{ id, name, icon }` do `cortex.json` com fallback pro slug da pasta. Fonte da identidade no lado JS (export + instalador); espelha `core/game_config.cpp` (runtime). |
| `native/scripts/embed-icon.mjs` | `embedIcon(exe, png, {productName})` — do `icon` do jogo (PNG) deriva `.ico` multi-tamanho (png-to-ico) e embute no `launcher.exe` ícone + ProductName/FileDescription + file-version (rcedit), SPEC-0127. Best-effort (falha não derruba o export). Libs no toolchain de export (`png-to-ico`/`rcedit`), resolvidas nos layouts dev/empacotado. **Windows-only.** |
| `native/export-toolchain/` | Toolchain de export AUTO-CONTIDO (TDR-0003): `package.json`+`yarn.lock` pinados (esbuild/babel/three/three-mesh-bvh/zod) que o `bundle.mjs` usa em runtime. O CI instala e o electron-builder copia o `node_modules` pra `resources/node_modules` (só Windows), pro Studio empacotado exportar sem dev. |
| `native/scripts/pak.mjs` | Empacota uma pasta num container `.pak` (ADR-0104): índice binário + XOR leve. Formato em sync com `native/src/shims/pak.cpp`. |
| `native/tests/` | **Testes unitários do C++** (TDR-0004): harness próprio zero-dependência (`harness.h`, macro `CHECK`) + alvo `cortex_host_tests` (CMake) cobrindo unidades PURAS — enums formato↔string (regressão do crash BC7), matemática de blocos BC7 (`src/shims/ktx2_math.h`), perf-log. Rodar: `yarn test:native` (ou o alvo direto no dev shell). Shims/scripts JS são testados no Vitest em `tests/native/` (suíte do engine). Integração wgpu/NAPI/Hermes fica com o soak (spec 0015 do teste4) + smoke do export. |

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

- **Exceção C++ na fronteira nativa mata o jogo — e o `terminate` do MSVC é POR
  THREAD** (ADR-0172 / SPEC-0173). Um crash real durante carregamento de fase
  saiu com 40 frames de backtrace e **zero** linha de causa. Mapa dos caminhos,
  medido:
  - exceção que **ninguém captura** → SEH `0xE06D7363` → `onCrash`
    ("CRASH (exceção nativa)"). **Não** passa por `terminate`.
  - `noexcept` violado / escape do callable de `std::thread` / exceção durante
    unwind → `terminate` → `abort` → `onAbort`.
  - `set_terminate` instalado no `main` **não vale pras outras threads**: toda
    thread criada pelo host precisa chamar `core::installThreadCrashHandler()`
    ao nascer, senão escape lá vira `abort` mudo.
  Blindagem em vigor: `njs::setMethod` embrulha **todo** binding num `try`/`catch`
  (funil único — é a única `napi_create_function` do host) e converte a exceção em
  erro JS; a worker do `io_pool` tem `try`/`catch` no corpo. Ao criar thread nova
  ou outro caminho de entrada nativo, repita as duas coisas.
- **`/EHsc` promete que `extern "C"` não lança** — e `napi_callback` é um typedef
  dentro de `extern "C"`. Um `try`/`catch` em volta de uma chamada por esse
  ponteiro pode ser considerado inalcançável pelo compilador. Por isso
  `src/napi/napi_util.cpp` compila com **`/EHs`** (sem o `c`), via
  `set_source_files_properties` no `CMakeLists.txt`. Não "limpe" essa flag.
- **O stderr do Rust não é o `stderr` do CRT.** `wgpu_native.dll` e
  `rapier_native.dll` escrevem panic por `GetStdHandle(STD_ERROR_HANDLE)`, que o
  `freopen_s` **não** redireciona — num exe sem console a mensagem
  ("Caused by: …") sumia, e sobrava só um backtrace sem explicação. O
  `installCrashHandler` agora faz também `SetStdHandle` pro `error_log.txt` e
  liga `RUST_BACKTRACE=1`.
- **Backtrace sem PDB mente.** O DbgHelp resolve para o **export público mais
  próximo**: nomes como `hermes::vm::JSOutOfMemoryError` ou
  `hermes_napi_load_module` com offset de `+0xa000`/`+0x67000` são ruído
  posicional, não a função real. O que é confiável: o **módulo** de cada frame
  (`launcher.exe` vs `wgpu_native.dll` — foi o que descartou o palpite de panic
  do wgpu) e símbolos de DLL com offset pequeno (`terminate+0x1e`). Leia a linha
  de causa, não os nomes.
- **O Hermes NÃO implementa o binding por iteração do `let`** — closure criada em
  `for (let i…)` enxerga o valor FINAL de `i`. Sonda no host:
  `for (let k=0;k<3;k++) probes.push(() => k)` → `3,3,3` (browser: `0,1,2`). É
  **silencioso**: build, typecheck e testes (que rodam em Node) passam; só o binário
  exportado adoece. Foi o que apagou a iluminação do Mundo 3 no export — o CSM do
  three indexa `this._shadowNodes[i]` dentro de closure e recebia `[4]` →
  `undefined` → exceção no build do shader → material preto. **Corrigido de vez**
  com `@babel/plugin-transform-block-scoping` no `bundle.mjs` (ADR-0146); a lista de
  transforms de lá precisa cobrir tudo que o Hermes não implementa direito — se
  aparecer outra divergência Studio ↔ export, suspeite dela primeiro.
- **Carga de fase roda numa ÚNICA virada de JS — rAF NÃO dispara no meio**
  (SPEC-0154). `fetch`/decodes são síncronos no host, então a cadeia de `await`
  de um load inteiro resolve em microtasks sem devolver o controle ao
  `runFrame` — um loop de render agendado via `requestAnimationFrame` (a tela
  de loading do engine/teste4) **nunca pinta durante a carga**, e o present do
  frame acontece DEPOIS do drain de microtasks (o que a carga deixar por último
  na RT é o que aparece). Modelo mental: **a tela durante uma operação pesada é
  o último frame APRESENTADO antes dela** — UI que precise estar visível tem de
  ser pintada e apresentada ANTES (pinta → `await` rAF → pinta → `await` rAF;
  dois quadros porque `backgroundImage` carrega assíncrono e só entra na 2ª
  pintura). Foi a arte do loading do teste4 sumindo no export.
- **Diagnóstico barato de divergência Studio ↔ export:** rode
  `dist-native/launcher.exe` com `CORTEX_LAUNCH_QUERY='?level=<id>'` (entra direto
  na fase) e leia o stdout — exceção de JS aparece lá com stack. Pra ler a linha
  culpada, gere o bundle à parte com `node native/scripts/bundle.mjs <out.js>
  <game>/main.ts`: o `export-game.mjs` apaga o `boot.bundle.js` após o `hermesc`.
  Um ciclo completo (build + export `CORTEX_NO_COOK=1` + rodar) leva ~40s, então
  bisectar hipóteses ligando/desligando features é prático.
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
- **PostFX pesado saiu pro C++ (ADR-0147/SPEC-0148).** O bloom e a vinheta rodam
  no host (`webgpu/bloom.cpp` + o composite do `supersample.cpp`), com o WGSL em
  `native/shaders/bloom.wgsl` como fonte única. space-1 foi de 58 → **75 fps** com
  o bloom ligado. ⚠️ O bloom nativo é **LDR**: o formato do offscreen é do three
  (ele monta os pipelines com o formato da canvas), e trocá-lo pra `RGBA16Float`
  fazia o wgpu PANICAR com "pipeline targets are incompatible with render pass".
  **Resolvido (ADR-0149):** o JS renderiza a cena numa RenderTarget HDR própria
  (`renderSceneHDR`) e entrega a textura ao host por `__cortexSceneHdr` — mesmo
  mecanismo da UI (ADR-0105). O host faz bloom + ACES em HDR, e o export passa a
  brilhar IGUAL ao Studio. A RT tem formato próprio (HalfFloat), independente da
  canvas, então não há conflito de formato. Sem bloom, o caminho LDR do offscreen
  segue igual.
- **O caro do PostFX é o BLOOM, e o custo é de PASSADA (encoding), não de pixel.**
  Medido no teste4 (space-1, 2 cascatas): com bloom 57-58fps, sem PostFX **75fps**
  — ~17fps. O bloom do three (`BloomNode`) faz uma pirâmide de **5 mips × 2 blurs
  ≈ 12 passadas**. Duas provas de que não é fill: `CORTEX_RENDER_SCALE=1.0` (contra
  o padrão 2.0, ou seja ¼ dos pixels) deu **o mesmo FPS**, e o **FXAA é de graça**
  (uma passada só). Então, num host CPU-bound em encoding, ligar bloom custa caro
  em qualquer resolução — e desligar SSAA não compra nada de volta. Alavanca real
  seria reduzir os mips do bloom (hoje fixo em `_nMips = 5` dentro do three).
- **CSM: cada cascata é uma PASSADA de render a mais** — no host, que é CPU-bound
  no render, o custo é por passada, não por texel. Medido no teste4 (space-1, na
  largada): sem CSM 15,2ms · 2 cascatas 18,3ms · 4 cascatas 25,5ms — ≈**2,5ms por
  cascata** (39 fps contra 54). Baixar o shadow map de 4096 pra 2048 **não mudou
  nada**, o que confirma o diagnóstico. Como cada cascata redesenha os casters,
  `shadowCascades` é uma das alavancas mais fortes de FPS numa cena com sol.
  ⚠️ **Correção de um engano que ficou documentado aqui:** antes se lia que 1
  cascata "apaga as sombras". Era o **far plane curto** (armadilha abaixo), não a
  cascata. Com o far correto: **1 cascata 70 fps · 2 cascatas 58 fps, com a MESMA
  sombra na tela**. Toda medição de sombra anterior àquele fix está contaminada —
  o far curto descartava casters, dando FPS alto com sombra errada. Ao mexer em
  sombra, confirme por SCREENSHOT, nunca só pelo FPS.
- **CSM: o `far` da sombra tem de cobrir `lightMargin + shadowDistance`.** As
  cascatas clonam `light.shadow`, e o three planta a luz de cada uma recuada de
  `lightMargin`. Com o `far` do caminho sem CSM (`shadowArea*4` = 240) contra a
  margem padrão (200), sobravam ~40u úteis: a sombra saía **cortada por uma
  reta**, e o corte **aparecia e sumia conforme a câmera se movia** (a caixa da
  cascata desliza no espaço da luz e cruza o limite) — reproduzido no Studio
  movendo só a câmera do editor. Corrigido no `OutdoorLighting`, travado por
  `tests/scene/OutdoorLighting.test.ts`. ⚠️ Corrigir CUSTA fps: os casters que o
  far descartava voltam a desenhar.
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

## Pré-requisitos (toolchain — instalação à parte, NÃO vêm no fetch-deps)

Regra de deps: **libs pequenas e livres** (SDL3, wgpu, hermes, stb, miniaudio,
basisu, NSIS) → `fetch-deps.ps1` (baixadas, pinadas, gitignoradas). **Toolchains
grandes/licenciados** → **pré-requisito**, o dev instala uma vez (não dá pra
vendorizar por tamanho/licença/integração com o VS):

- **Visual Studio / MSVC (x64)** — headers/libs do Windows (build num prompt `vcvars64`).
- **LLVM/clang-cl** (`winget install LLVM.LLVM`) — **compilador OFICIAL do host**
  desde 2026-07-18: o interpretador do Hermes fica ~20% mais rápido que no MSVC
  (fase 1 do teste4: 58-62 → 70-73 fps). Configure com
  `-DCMAKE_C_COMPILER=clang-cl -DCMAKE_CXX_COMPILER=clang-cl` (ainda dentro do
  `vcvars64` — o clang-cl usa headers/libs do MSVC). Os patches de compat do
  hermes moram em `native/patches/hermes-upstream.patch` (fetch-deps aplica).
  Build só-MSVC continua funcionando (fallback), só mais lento.
- **Rust (cargo)** — compila o `rapier-native` (`cargo build --release` lá).
- **Steamworks SDK** (só pro release **PC/Steam**) — baixe em
  partner.steamgames.com (atrás de login de parceiro, como o GDK; **não** vem no
  fetch-deps). Extraia p/ `native/third_party/steamworks` (ou defina
  `STEAMWORKS_SDK`). Habilita overlay/conquistas/cloud via `-DCORTEX_STEAM=ON`.
- **Microsoft GDK** (só pro export **console/Xbox**, M3) — SDK grande (GB+),
  licenciado, integra com o VS. **Público** (`Gaming.Desktop.x64`) cobre todo o
  dev de app-model **sem NDA**; os alvos de console (`Gaming.Xbox.*`) exigem
  **ID@Xbox** + GDKX (sob NDA). Instalação: https://github.com/microsoft/GDK#installation
  (via winget: `winget install Microsoft.Gaming.GDK`). O Studio **detecta** o GDK
  (env `GameDK`/`GRDKLatest`) e orienta — **não** instala.

## Build & run

```powershell
powershell -File native/scripts/fetch-deps.ps1   # 1x (baixa deps pinadas)
# num prompt com vcvars64:
cmake -G Ninja -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
native/build/cortex_host.exe
```

**Release Steam (PC)** — opt-in, exige o Steamworks SDK (pré-requisito acima):
```powershell
cmake -G Ninja -S native -B native/build-steam -DCMAKE_BUILD_TYPE=Release -DCORTEX_STEAM=ON
cmake --build native/build-steam   # linka steam_api64; copia dll + steam_appid.txt (480 dev)
```
**NÃO existe `-DCORTEX_STEAM_APPID`** (ADR-0174): o app id é DADO do jogo, lido do
`cortex.json` em runtime — um mesmo host serve qualquer título. Aqui se decide só
se o SDK é linkado. Com o cliente Steam aberto: `[steam] init OK (app N)`.

**App id do jogo:** *Configurações do jogo* no Studio → campo **Steam App ID**,
gravado como `steamAppId` no `cortex.json` do projeto. Sem ele o export `--steam`
FALHA (é o portão). Use 480 (Spacewar) pra testar.

**Export modo Steam:** `node native/scripts/export-game.mjs <gameDir> --steam`
usa o host `build-steam`, inclui a `steam_api64.dll` e propaga o `steamAppId` pro
`cortex.json` do build. **Recusa exportar** se o projeto não declarar app id. O
`steam_appid.txt` (dev) NÃO vai no release — ele sobrepõe o id que o cliente Steam
informa, e a Valve manda tirar. Sem `--steam` é o export desktop normal, e o campo
some do `cortex.json` do build.

**Capacidades no jogo (SPEC-0175):** conquistas, stats, overlay, jogador e idioma
via a fachada `Steam` do engine (`src/core/steamworks.ts`) sobre as globais
`__cortexSteam*` (`native/src/shims/steam_api.cpp` → `core/steam_stats.*` e
`core/steam_user.*`). Fora do export Steam tudo vira no-op — o mesmo bundle roda
no PC puro. **Save na nuvem:** Steam Auto-Cloud, sem código — os saves já vão em
`SDL_GetPrefPath(<id>, "saves")`; no painel use Root `WinAppDataRoaming`,
Subdirectory `<id do jogo>/saves`, Pattern `*`.

**Upload (SteamPipe):** `node native/scripts/steam-upload.mjs <distDir> --depot <id>`
gera o `app_build.vdf` e chama o `steamcmd`. O app id sai do `cortex.json` do
PRÓPRIO build — não há como subir um artefato pro app errado. `--dry-run` imprime
o `.vdf` sem subir; `--branch <nome>` publica no branch (o `default` é recusado de
propósito — publique pelo painel); `--user <login>` usa a sessão do steamcmd
(senha nunca vai por argumento). O binário sai de
`third_party/steamworks/tools/ContentBuilder/builder/` ou do PATH. (Registro do
app + o Steam Direct de US$100 + a página da loja são no Steamworks; parte sua.)

**App model do GDK (M3)** — opt-in, exige o GDK instalado (pré-requisito acima):
```powershell
cmake -G Ninja -S native -B native/build-gdk -DCMAKE_BUILD_TYPE=Release -DCORTEX_GDK=ON
cmake --build native/build-gdk   # linka xgameruntime.lib; XGameRuntimeInitialize no boot
```
O CMake acha a maior versão do GDK em `C:\Program Files (x86)\Microsoft GDK\*\windows`.
Compila+linka e o `XGameRuntimeInitialize` retorna OK no desktop.

**Empacotar como app GDK** (`MicrosoftGame.config` + logos):
```powershell
node native/scripts/gdk-package.mjs <layoutDir> "<AppName>" <exe.exe>  # gera config + logos
# valida (config-level): makepkg validate /d <layout> /pd <out>
# registrar p/ rodar (dev): wdapp register <layout>\MicrosoftGame.config
```
`gdk-package.mjs` gera um `MicrosoftGame.config` válido (Identity/Executable/
ShellVisuals + `<DesktopRegistration><DependencyList><KnownDependency VC14>` — o
VC++ Redist que o exe/dlls puxam) + logos placeholder nas dimensões exatas que o
validador exige (Square44/150/480, StoreLogo 100², Splash 1920×1080).

**✅ App model validado de ponta a ponta no PC (sem NDA):** `wdapp register` do
loose layout → rodar o exe → `XGameRuntimeInitialize OK` + **package identity**
(`XPackageGetCurrentProcessPackageIdentifier`). Com identidade, XUser/XGameSave/
achievements passam a funcionar. (`wdapp register` exige **Modo de Desenvolvedor**
ligado; `wdapp unregister <id>` desfaz.)

**XGameSave** (`user_storage.*`): o backend de save já tenta o XGameSave sob GDK
(`XUser` + `XGameSaveFilesGetFolderWithUi`) e **cai pro arquivo** sem SCID/usuário
— validado: compila+linka e faz fallback no dev PC (log `[storage] XGameSave
indisponível`). Ativa com um **título configurado** (SCID via `CORTEX_SCID`) +
usuário Xbox assinado (Partner Center/ID@Xbox).

**Portões/próximos:**
- **Binary scan** (`makepkg validate`): o exe precisa do **build platform completo
  `Gaming.Desktop.x64`** (props do GDK: extension libs, flags) — hoje é CMake plano
  linkando só o `xgameruntime.lib`. **Próximo passo técnico** (antes de XGameSave).
- **`makepkg validate` completo** (submission validator) precisa de `XtfApi.dll`
  (tooling de console, não vem no GDK **público**).
- **Console** (`Gaming.Xbox.*`): ID@Xbox + GDKX (NDA) + o backend gráfico D3D12X
  (risco nº 1 — wgpu não serve lá).

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
`user_storage.*` (`SDL_GetPrefPath`), SPEC-0106. O `SaveGame` do teste4
(progressão da spec 0003) agora persiste entre sessões no `.exe`.
Pós-M1 (feito): **export nativo embarcado no Studio Windows** (TDR-0003) — o
`.exe` instalado exporta nativo sem dev. O host compilado + o toolchain de
export auto-contido (`native/export-toolchain/`) + o `src/` da engine vão no
instalador via `electron-builder.json#win.extraResources`; o CI (composite
`.github/actions/build-native-host`) compila o host no runner Windows
(Rust+MSVC+Ninja/CMake → `fetch-deps` → `cargo` → `cmake`) antes do
`electron:build`. macOS/Linux ficam sem export nativo (host é D3D12/Windows).
Pós-M1 (feito): **instalador PC** — `native/scripts/make-installer.mjs` empacota
o `dist-native/` num `<jogo>-setup.exe` (NSIS portátil do fetch-deps; template
estático `installer.nsi` com valores por `/D`). Instala POR USUÁRIO
(`%LOCALAPPDATA%\Programs\<app>`, sem admin): atalhos + Adicionar/Remover +
desinstalador. Também: **KTX2** cozido no export (ADR-0108) e save persistente
(SPEC-0106/0107).
Pós-M1 (aberto): Speedometer+vehicle controller; espacialização do Panner;
mapAsync/copyTextureToTexture/MSAA; formatos BC no host (VRAM); persistência no
CONSOLE (trocar o backend de user_storage por XGameSave).

Build do Rapier nativo: `cargo build --release` em `native/rapier-native/`
(1x; o CMake linka `target/release/rapier_native.dll.lib` e copia a dll).
