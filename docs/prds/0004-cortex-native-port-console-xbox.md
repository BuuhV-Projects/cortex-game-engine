# PRD 0004 - CortexNative: port 100% nativo para console (Xbox)

**Data:** 2026-07-04
**Status:** em execução — M0 iniciado em 2026-07-05 (`native/`): Marcos A e B
provados no PC (SDL3 + wgpu-native D3D12 + Hermes executando JS que comanda o
frame). Ver `native/README.md`.

## Problema

O cortex-game-engine roda sobre tecnologia web (Three.js WebGPU + Rapier WASM +
DOM), hospedado no Electron (Studio) e empacotado pra PC via Tauri (ADR-0024).
Console não roda nada disso: o Xbox não executa Electron/Node/Tauri, proíbe JIT
(elimina o V8) e títulos "de primeira classe" (loja principal, achievements,
Game Pass) exigem um app nativo GDK.

Existem dois caminhos pra chegar ao Xbox:

1. **Caminho curto (não é este PRD):** empacotar o build web como app UWP com
   WebView2 e publicar via Xbox Creators Program. Sem GDK, sem achievements,
   recursos de hardware limitados. Serve como validação/MVP de publicação.
2. **Caminho completo (este PRD):** host nativo GDK que executa o JavaScript do
   jogo sem browser e sem WebGL — o "CortexNative".

**Restrição de produto:** o suporte a PC standalone **continua sendo via Tauri**
(ADR-0024). O CortexNative é um **alvo adicional** de export, não um substituto.
Matriz de alvos após este PRD:

| Alvo | Casca | Status |
|---|---|---|
| Studio / dev | Electron | existente |
| PC standalone | Tauri | existente — **permanece** |
| Xbox (nativo) | CortexNative (GDK) | este PRD |

## Decisão de arquitetura (proposta)

O jogo continua sendo **o mesmo bundle JavaScript** (Three.js + cortex + código
do jogo). Troca-se a plataforma embaixo dele. Quatro pilares:

### 1. Runtime JS: Hermes

- Fork `microsoft/hermes-windows` (mantido pela Microsoft pro React Native
  Windows — MSVC/x64 já provado; Xbox Series é Windows x64 enxuto/Game Core).
- Bundle compilado **offline** com `hermesc` → bytecode `.hbc` (AOT; console
  proíbe JIT e o Hermes não tem JIT — é exatamente por isso que foi escolhido).
- Bindings nativos via **JSI** (chamadas JS↔C++ baratas e de alta frequência —
  o perfil de carga do Three: milhares de calls de render por frame).
- Alternativa avaliada: QuickJS (mais simples de portar, precedente ChowJS em
  consoles, porém interpretador mais lento e sem JSI). Decidir no M0 com
  benchmark real se o Hermes confirmar a vantagem.

### 2. Gráficos: Dawn (WebGPU nativo → D3D12)

A chave do projeto. O cortex **exige WebGPU** (`Renderer.ts` aborta sem
`navigator.gpu`) — e WebGPU, ao contrário de WebGL, tem implementações nativas
maduras feitas pra embutir:

- **Dawn** (implementação C++ do Chrome, backend D3D12) exposta ao Hermes via
  JSI como `navigator.gpu`. O `WebGPURenderer` do Three conversa com ela como
  se fosse o browser. **Nenhuma simulação de WebGL em lugar nenhum.**
- Shaders: o TSL gera WGSL → **Tint** (dentro da Dawn) → HLSL → DXC → DXIL.
  No console, pré-aquecer/empacotar **pipeline cache** (console não gosta de
  compilar shader em runtime).
- Alternativa: wgpu (Rust, do Firefox) — mesma ideia; Dawn preferida por ser
  C++/CMake como o resto do host GDK. Revalidar no M0.
- Precedente: Three WebGPURenderer já roda fora de browser (Deno sobre wgpu).

### 3. Física: Rapier nativo

Hermes não executa WASM. O Rapier é Rust — em vez do `rapier3d-compat` (WASM),
compilar o Rapier como **staticlib nativa** e escrever bindings JSI espelhando
a mesma API JS, pra o código do engine não mudar (só troca a implementação por
baixo). Bônus: física mais rápida que a versão WASM.

### 4. Camada de plataforma: SDL3 + shims web

**SDL3 tem suporte oficial a GDK/GDKX** (janela, input, áudio — targets
`Gaming.Desktop.x64`, `Gaming.Xbox.XboxOne.x64`, `Gaming.Xbox.Scarlett.x64`
no release público; só os alvos de console exigem licença GDKX). O host fala
SDL3 e o mesmo código cobre PC (Windows/Linux/macOS) e Xbox — em vez de
escrever GameInput/XAudio2 na mão. Ref: https://wiki.libsdl.org/SDL3/README-gdk

| API web usada pelo runtime | Implementação nativa |
|---|---|
| `requestAnimationFrame`, timers, `performance.now` | loop de jogo (SDL3) |
| Gamepad API (`GamepadManager`) | SDL3 gamepad (→ GameInput no console; engine já é gamepad-first, ADR-0078) |
| WebAudio (`AudioManager`) | SDL3 audio / miniaudio |
| `fetch` / carga de assets | filesystem no PC; XPackage no console |
| decode de imagem (texturas GLB) | WIC/stb — ou migrar texturas pra **KTX2** (preferido: sem decoder e menos memória de GPU) |
| `localStorage` / saves | arquivo no PC; XGameSave no console |
| `console.*` / `debug()` | stdout/debug output do devkit |

Código console-específico fica restrito aos cantos GDK: `MicrosoftGame.config`,
XGameRuntime, XUser (sign-in), XGameSave, suspend/resume (reconstruir
swapchain, pausar áudio), empacote com `makepkg`.

**O host é dual-target por construção:** Hermes, Dawn, Rapier e SDL3 compilam
pra PC e console a partir do mesmo codebase. O que sai do M0–M2 já é um
runtime de PC completo (executável Windows real, não um simulador) — ~95% do
debugging do console acontece no build PC com renderer/física idênticos. Isso
NÃO substitui o Tauri (ver Consequências): abre, no futuro, uma opção extra de
export PC "nativo premium" (mesma build do console; compila sem GDK pra Steam
com SDL3 puro + Dawn), enquanto o Tauri segue como caminho leve.

## Mudanças necessárias no engine (auditoria de 2026-07-04)

Grep de DOM/browser no runtime (fora de `src/editor`, que fica no PC):

1. **UI DOM de runtime — o item grande.** `src/dialogue/DialogueUI.ts`
   (overlay do ADR-0070), `src/core/LoadingScreen.ts` e `src/ui/Speedometer.ts`
   desenham com elementos HTML. Console não tem DOM. Criar **abstração de UI**
   com dois backends: DOM (PC/Tauri/Studio — comportamento atual) e desenhada
   pelo renderer (sprites/quads Three) no console.
2. **Input/lifecycle:** `InputManager`, `GamepadManager`, `Game.ts` usam
   listeners de `window`/`document` — o shim cobre a maioria; pointer lock nos
   sistemas de câmera (1ª/3ª pessoa) vira opcional (console não tem mouse).
3. **Miúdos:** `localStorage` no `debug.ts`, detecção de ambiente etc.
4. **Regra nova de arquitetura:** "runtime core não toca DOM diretamente"
   (enforçar com teste/lint). Editor pode; runtime não.
5. **Bootstrap headless:** entrada do jogo que recebe canvas/surface injetada
   em vez de criar via `document`.
6. **Pipeline de texturas KTX2** no build de export console.

Nada disso quebra os alvos atuais — a abstração de UI e o bootstrap headless
beneficiam PC/Tauri também.

## Portões não-técnicos (fora do nosso controle)

- **ID@Xbox aprovado** é pré-requisito absoluto pro console: dá acesso ao GDKX
  (sob NDA) e a devkits físicos. **Dev Mode de console de varejo NÃO roda
  títulos GDK** (só UWP).
- O GDK **público** (`Gaming.Desktop.x64`) cobre todo o desenvolvimento em PC
  sem NDA — mesmos app model, toolchain e APIs. M0–M2 inteiros rodam nele.
- Certificação XR da Microsoft no final (suspend/resume, sign-in, saves).

## Roadmap

- **M0 — prova de fogo (PC, semanas):** host C++ mínimo: SDL3 + Hermes + Dawn
  renderizando um cubo do Three a partir de bundle `.hbc`. Valida o conceito
  inteiro. Decide Hermes×QuickJS e Dawn×wgpu com números.
- **M1 — engine completo no PC (2–4 meses):** cena real do cortex bootando no
  host `Gaming.Desktop.x64`: level.json, GLB, texturas, Rapier nativo,
  GameInput, áudio.
- **M2 — mudanças de engine:** abstração de UI sem DOM, KTX2, bootstrap
  headless, regra "runtime sem DOM".
- **M3 — console (pós-ID@Xbox):** recompilar pra `Gaming.Xbox.Scarlett.x64`;
  portar Dawn pro D3D12 do Game Core (swapchain/present e memória diferem do
  desktop — **risco técnico nº 1**); pipeline cache de shaders; superfície de
  API Win32 permitida (validador do GDK aponta).
- **M4 — certificação XR e publicação.**

Estimativa honesta: 6–12 meses de ponta a ponta (1 dev experiente + IA), sendo
M0–M2 executáveis hoje sem nenhuma dependência da Microsoft.

## Riscos

1. **Dawn no Game Core** (D3D12X, present, residência de memória) — mitigação:
   M0–M2 provam tudo no desktop primeiro; a Dawn isola o backend D3D12.
2. **Compilação de shader em runtime** (TSL gera WGSL dinamicamente) —
   mitigação: pipeline cache pré-aquecido no build; conjunto de materiais do
   jogo é finito.
3. **Performance de JS interpretado no main loop** — mitigação: Hermes
   bytecode + JSI; hot paths já são GPU (skinning) ou nativos (Rapier, render);
   benchmark no M0 antes de comprometer.
4. **Custo de manter 2 backends de UI** — mitigação: abstração pequena (o
   runtime só tem diálogo, loading e HUD hoje).

## Consequências

- PC standalone permanece **Tauri** (ADR-0024); Studio permanece Electron.
  CortexNative é um alvo novo de export, aditivo.
- A escolha já feita de **WebGPU obrigatório** no Renderer é o que torna este
  plano viável sem reescrever a camada gráfica — não regredir pra WebGL2 como
  caminho principal.
- Trocar Three.js por Babylon.js foi avaliado e **descartado**: custaria
  reescrever o engine e o Babylon Native não suporta console oficialmente —
  o host teria que ser portado do mesmo jeito.
- Quando M0 for iniciado, criar ADR próprio com as decisões travadas
  (Hermes×QuickJS, Dawn×wgpu) e atualizar o architecture.md com o novo alvo.

## Referências

- Hermes p/ Windows: https://github.com/microsoft/hermes-windows
- Hermes em consoles (discussão): https://github.com/facebook/hermes/discussions/1296
- Dawn (WebGPU nativo): https://dawn.googlesource.com/dawn
- wgpu: https://github.com/gfx-rs/wgpu
- GDK público: https://github.com/microsoft/GDK
- ChowJS (precedente JS AOT em console): https://mp2.dk/techblog/chowjs/
- CrossCode (precedente JS→console via AOT): https://www.radicalfishgames.com/?p=6892
- Babylon Native (avaliado e descartado): https://github.com/BabylonJS/BabylonNative
