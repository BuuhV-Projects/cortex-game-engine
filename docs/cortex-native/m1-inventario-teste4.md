# M1 — Inventário do teste4 e plano do "engine completo no host"

**Data:** 2026-07-05 · **Base:** `D:\jogos\teste4`, branch `refactor/port-console-xbox`
**Meta do M1:** o teste4 (Cute Obstacle Rush) bootando e jogável no
`cortex_host.exe` — o jogo real valida o que o cubo do M0 não exercitou.

## Inventário: o que o jogo + engine usam de browser

Auditoria por grep no teste4 (main/utils/systems/scripts) e no engine
(`src/core`). Categorias, da mais fácil pra mais difícil:

### 1. Event bus via `document` (CustomEvent) — FÁCIL, puro JS
`document.addEventListener/dispatchEvent(new CustomEvent('rush:*'))` é o
barramento de eventos do jogo (RushSystem, RushAudio, CameraDirector,
scripts). **Não é DOM de verdade** — é EventTarget. Shim: implementação de
EventTarget + classe CustomEvent no prelude. Zero C++.

### 2. Input — C++ pequeno (SDL3 já está no host)
- `window.addEventListener('keydown'/'pointerdown')` (RushSystem, RushAudio,
  MainMenu) e `InputManager.attach(document.body)` do engine.
- `navigator.getGamepads()` (MainMenu + GamepadManager do engine —
  gamepad-first, ADR-0078).
- Shim: eventos SDL3 → despachar keydown/keyup/pointerdown no event bus do
  item 1; Gamepad API sobre SDL_Gamepad (mapeamento de botões já padronizado
  pelo SDL).

### 3. Assets/fetch — C++ pequeno + decisão de textura
- Cena: `scenes/*.json` (SceneFile) — via fetch.
- Modelos: `assets/*.glb` (GLTFLoader do three) — fetch(arrayBuffer) +
  **decode de textura**: o GLTFLoader usa createImageBitmap/Blob/Image.
- Shim: fetch nativo lendo do diretório do jogo (depois: XPackage no
  console); decode de imagem nativo (stb_image → ImageBitmap) OU migrar
  texturas pra KTX2 (preferido a médio prazo — PRD-0004).

### 4. Áudio — WebAudio subset (médio)
`AudioManager` do engine = `THREE.Audio/PositionalAudio/AudioListener` →
WebAudio (AudioContext, GainNode, AudioBufferSourceNode, PannerNode,
decodeAudioData). RushAudio destrava o AudioContext por gesto — no host não
há política de gesto (context nasce "running").
Shim: WebAudio-lite nativo sobre SDL3 audio/miniaudio, cobrindo só o que o
THREE.Audio usa. Alternativa: backend nativo direto no AudioManager
(abstração no engine) — decidir na hora com ADR.

### 5. Rapier — bindings nativos (GRANDE, mas mecânico)
Hermes não roda WASM → `rapier3d-compat` não funciona. Rapier é Rust:
compilar `rapier3d` como staticlib com cabine de bindings espelhando a API
JS do compat (World, RigidBody, Collider, CharacterController, raycast...).
Só a superfície que o engine usa (`src/physics/`) — mapear antes de escrever.
Requer toolchain Rust na máquina de build.

### 6. HUD/Menu DOM real — a frente de ENGINE (decisão com ADR próprio)
- teste4: MainMenu (createElement/style/appendChild) e HUD do RushSystem
  (divs coins/timer/banner + innerHTML).
- engine: DialogueUI (ADR-0070), LoadingScreen, Speedometer.
- Console não tem DOM. Caminho em 2 etapas:
  a) **DOM-lite inerte** no prelude (createElement devolve objeto inofensivo,
     appendChild no-op): o jogo RODA sem HUD visível — desbloqueia testar
     gameplay/física/render antes da UI real.
  b) **Abstração de UI do engine** com 2 backends: DOM (PC/Tauri, comporta-
     mento atual) e desenhada pelo renderer (console). Vale ADR + mudança
     nos jogos (HUD do teste4 migra pra API do engine em vez de divs).

### O que o engine já faz certo (não precisa mudar)
`Game` recebe canvas injetado; `window.innerWidth`/`resize` e
`input.attach(document.body)` têm guard de `typeof` — o bootstrap headless
já quase funciona. `debug()` usa localStorage com guard.

## Ordem de ataque do M1

| # | Frente | Tamanho | Desbloqueia |
|---|---|---|---|
| 1 | Event bus + CustomEvent + DOM-lite (prelude) | P (JS) | RushSystem/scripts/CameraDirector |
| 2 | Input (keydown/pointer + Gamepad API sobre SDL3) | P/M (C++) | jogar com controle |
| 3 | fetch + decode de textura (stb → ImageBitmap) | M (C++) | cena JSON + GLBs do kit |
| 4 | Rapier nativo (bindings espelhando compat) | G (Rust+C++) | física = gameplay |
| 5 | WebAudio-lite (SDL3/miniaudio) | M (C++) | RushAudio |
| 6 | UI do engine sem DOM (ADR + 2 backends) | G (engine) | HUD/menus de verdade |

Critério de fim do M1: **teste4 jogável no host** (menu navegável no
controle, fase carregada, física, moedas, áudio) — HUD pode estar na etapa
6a (invisível) se a 6b ainda estiver em andamento.

## Lacunas conhecidas do shim WebGPU (herdadas do M0)
mapAsync (readback), blend states (transparência!), writeTexture (upload de
textura — necessário na frente 3), MSAA. A frente 3 força writeTexture +
copyExternalImageToTexture; implementar junto.
