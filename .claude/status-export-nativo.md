# Status: export nativo (PC / Steam / Xbox)

**Auditoria de:** 2026-07-15
**Veredito:** NÃO está 100% fechado. PC standalone ✅ fechado; Steam 🟡 ~90%;
Xbox console 🔴 só a fase PC do caminho GDK validada (M3/M4 não começaram).

Fontes de verdade (reler antes de retomar):
- [PRD-0004](../docs/prds/0004-cortex-native-port-console-xbox.md) — plano completo M0–M4
- [architecture.md do native](../docs/cortex-native/architecture.md) — mapa vivo, seções "Build & run" e "Estado e próximos marcos"
- `native/scripts/export-game.mjs` (`--steam` / `--xbox`), `native/src/core/steam.*`, `native/scripts/gdk-package.mjs`
- Studio: IPC `export:native` em `electron/main.ts` (submenu Exportar › pc/steam/xbox)

## PC standalone — ✅ fechado e provado (teste4 jogável)

- `export-game.mjs <gameDir>` → `dist-native/` standalone (exe + dlls + boot.hbc + assets); validado.
- Instalador NSIS por usuário (`make-installer.mjs`), save persistente (SPEC-0106/0107), KTX2 (ADR-0108), export embarcado no Studio instalado (TDR-0003).
- **Pendências abertas:** vehicle controller do Rapier (carro) + Speedometer; PannerNode sem espacialização 3D; mapAsync/copyTextureToTexture/MSAA; formatos BC (VRAM); texto maior que o botão não recorta.
- **Limitação de perf:** gameplay nativo ~35fps vs 60-75 no Studio — render CPU-bound (three WebGPU no Hermes); alavancas = menos objetos/materiais/PostFX.
- Só Windows (host é D3D12); macOS/Linux sem export nativo.

## Steam — 🟢 engine fechada; falta só o que depende da Valve

**Atualizado em 2026-07-31 (ADR-0174 / SPEC-0175), SDK Steamworks v1.65.**

**Validado:**
- Build `-DCORTEX_STEAM=ON` (490/490, clang-cl): linka `steam_api64`, init +
  RestartAppIfNecessary + RunCallbacks por frame.
- **App id é DADO do projeto, não constante de compilação** — `steamAppId` no
  `cortex.json`, editável em *Configurações do jogo* no Studio. `-DCORTEX_STEAM_APPID`
  foi REMOVIDO; um host serve qualquer título. Publicar não exige mais toolchain C++.
- **`export-game.mjs --steam` RECUSA build sem app id** (provado no teste4 real) e
  propaga o número pro `cortex.json` do build. `steam_appid.txt` continua só de dev.
- **Capacidades expostas ao jogo**: conquistas, stats (int/float), overlay
  (+ estado, pra pausar), nome/SteamID64/idioma do jogador — `core/steam_stats.*`,
  `core/steam_user.*`, shim `shims/steam_api.cpp`, fachada `Steam` do engine.
  Tudo no-op fora do export Steam.
- **Upload**: `native/scripts/steam-upload.mjs` gera o `.vdf` (app id vindo do
  próprio build) e chama o steamcmd; `--dry-run` validado.
- **Cloud**: Steam Auto-Cloud cobre os saves sem código (`%APPDATA%\<id>\saves\`).

**Falta pra 100% (nada disso é código):**
1. Partes do usuário: app id real, Steam Direct (US$100), página da loja.
2. Upload real via SteamPipe com credencial de parceiro (o caminho está pronto e
   testado em dry-run; falta exercitar com app de verdade).
3. **Overlay não foi verificado com o cliente Steam real** — o hook é em D3D12 e o
   host renderiza por wgpu→D3D12, então deve funcionar, mas não está provado.

Pré-requisito de build: Steamworks SDK em `native/third_party/steamworks` (ou env `STEAMWORKS_SDK`) — baixado de partner.steamgames.com, não vem no fetch-deps.

## Xbox console — 🔴 NÃO fechado

**Validado (tudo no PC, GDK público `Gaming.Desktop.x64`, sem NDA):**
- Build `-DCORTEX_GDK=ON` → `XGameRuntimeInitialize OK`.
- `gdk-package.mjs` gera `MicrosoftGame.config` + logos válidos; `wdapp register` com package identity funcionando.
- XGameSave compila e cai pro arquivo sem SCID/usuário (fallback validado).

**Portões abertos (ordem do próprio doc):**
1. **Binary scan do `makepkg validate`** — exe precisa do build platform completo `Gaming.Desktop.x64` (props do GDK: extension libs, flags); hoje é CMake plano linkando só `xgameruntime.lib`. **Próximo passo técnico declarado.**
2. Validação completa de submission exige `XtfApi.dll` (não vem no GDK público).
3. **ID@Xbox aprovado + GDKX (NDA) + devkit físico** — pré-requisito absoluto (Dev Mode de varejo não roda GDK).
4. **Risco técnico nº 1:** backend gráfico é wgpu → D3D12 desktop, que **não serve no Game Core** — port pro D3D12X (swapchain/present/memória) é M3, não iniciado. Idem pipeline cache de shaders.
5. XGameSave real (SCID via `CORTEX_SCID` + usuário assinado), suspend/resume, certificação XR (M4).

**Ajustes de memória/perf já preparados pro console (SPEC-0152/0155, 2026-07-25):**
- O host injeta **`__cortexPlatform`** (`"xbox"` com `-DCORTEX_GDK`, senão `"pc"`)
  pré-boot — os jogos dimensionam custo por alvo.
- teste4 já usa: **shadow map do CSM 4096²→2048² no Xbox** (Series S tem memória
  unificada ~8 GB; o par cor+depth de 4096² custa ~128 MB). Padrão a repetir em
  jogos novos: `__cortexPlatform === 'xbox'` → mapas/efeitos mais baratos.
- O resto do trabalho de memória vale integralmente no console: BC7 (obrigatório
  em D3D12), destroy adiado, teto de heap do Hermes (512 MB), caches residentes
  com despejo na troca de mundo. Platô medido no PC: ~1,5 GB VRAM + ~1,4 GB RAM
  — dentro do budget do Series S.

## Próximos passos mais baratos (sem depender da Microsoft)

1. Binary scan do GDK: migrar o build GDK pro build platform completo `Gaming.Desktop.x64`.
2. API de conquistas/cloud Steam exposta pro jogo (em cima do `steam.cpp` existente).
3. Exercitar um upload real via SteamPipe (appid 480 ou app real).
