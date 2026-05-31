# 0024 - Instalador final do jogo com Tauri 2

**Data:** 2026-05-28
**Status:** aceito

## Contexto

Jogos criados com o `cortex-game-engine` precisam de uma forma de serem
distribuídos como executável instalável fora do contexto do IDE. Sem
isso, o jogo só roda no preview do IDE — não há caminho para publicar.

Restrições do primeiro alvo de distribuição (definidas com o usuário):

- **Plataforma**: somente Windows.
- **Canal**: download direto de site próprio (sem Steam, sem itch.io,
  sem requisitos de loja).
- **Sem code signing** nesta fase — o usuário aceita o aviso do
  SmartScreen para os testes iniciais.
- **Sem auto-update** nesta fase — toda atualização será um download
  manual do novo instalador.
- **Sem custom Rust commands** — o jogo é puramente web (Three.js
  + cortex-game-engine), o Rust é só a casca que carrega o WebView2.

Alternativas avaliadas:

- **Electron** — empacotaria a stack atual sem mudanças, mas o
  instalador ficaria em ~150–200 MB porque embute Chromium inteiro.
  Para download direto de jogo indie, esse peso impacta a conversão.
- **Tauri 2** — usa o WebView2 do SO (no Windows, Edge baseado em
  Chromium), instalador ~10–20 MB. WebView2 já vem no Windows 11 e no
  Windows 10 recente; nos casos raros em que falta, o bootstrapper
  online resolve.
- **Transpilação para Rust/C++** — descartada de plano: Three.js +
  Vite + o engine não transpilam, seria reescrita completa.

## Decisão

Adotar **Tauri 2** como formato de instalador final para os jogos
criados pelo IDE.

### O que entra agora

- Template de novo projeto ([templates/new-project/](../../templates/new-project/))
  já vem com `src-tauri/` configurado:
  - `Cargo.toml` minimalista (somente `tauri` + `tauri-build`,
    sem plugins).
  - `src/main.rs` apenas chama `Builder::default().run(...)` — nenhuma
    capacidade nativa exposta ainda.
  - `tauri.conf.json` aponta `frontendDist` para `../dist` (saída do
    Vite) e usa `nsis` como único bundle target.
- `package.json` ganha `@tauri-apps/cli@^2` em devDependencies e três
  scripts: `tauri`, `tauri:dev`, `tauri:build`.
- `vite.config.ts` recebe `clearScreen: false`, `server.strictPort: 5173`
  e `watch.ignored: ['**/src-tauri/**']` para coexistir bem com o
  fluxo Tauri.
- `.gitignore` adiciona `src-tauri/target/`.
- O README explica os pré-requisitos (Rust, MSVC Build Tools,
  WebView2) e o fluxo `yarn tauri icon → yarn tauri:build`.

### O que NÃO entra agora (escopo deferido)

- **Code signing** — sem certificado, o SmartScreen exibe "Editor
  desconhecido". Aceito enquanto for teste; vira ADR/TDR próprio
  quando a publicação for séria.
- **Auto-update** — sem `@tauri-apps/plugin-updater`. Versão nova =
  novo download manual.
- **Ícones placeholder no template** — o usuário roda
  `yarn tauri icon <png>` antes do primeiro build, uma vez por
  projeto. Embutir placeholders binários no template foi descartado
  pra manter o template enxuto.
- **Comandos custom Rust** — quando o jogo precisar de algo nativo
  (escrever save no disco, ler config do usuário, abrir URL), os
  plugins oficiais (`@tauri-apps/plugin-fs`, `plugin-dialog`, etc.)
  entram caso a caso, não preventivamente.
- **Integração com o IDE** — o IDE expõe o build via Menu nativo:
  **Projeto → Gerar instalador...** (atalho `Ctrl+Shift+B` /
  `Cmd+Shift+B`). O item dispara `yarn tauri:build` no projeto ativo
  e usa a aba Terminal do BottomPanel pra mostrar os logs. Reusa a
  infra existente (`terminal:run` IPC, ADR-0012) — sem novo canal
  IPC dedicado. Bloqueado enquanto o Play está ativo ou outro
  comando ocupa o terminal.
- **Setup automático em projetos legados** — projetos criados antes
  do template Tauri-ready (sem `src-tauri/` nem scripts no
  `package.json`) são detectados ao clicar "Gerar instalador". Dois
  IPCs cobrem o fluxo: `installer:check` (retorna se já está
  configurado) e `installer:setup` (copia `src-tauri/` do template,
  substitui `{{PROJECT_NAME}}` e mescla scripts/devDeps no
  `package.json`). O setup é idempotente e não toca em
  `vite.config.ts` — o usuário pode ter editado, e os ajustes desse
  arquivo só importam pro `tauri:dev`, não pro build. Depois do
  setup, o IDE encadeia `yarn install` e instrui o usuário a gerar
  os ícones antes do próximo clique.
- **Pré-requisitos não são validados pela IDE neste momento**: se
  faltar Rust toolchain, MSVC Build Tools ou os ícones (gerados via
  `yarn tauri icon`), o erro aparece no próprio terminal — o README
  do template cobre como resolver. Instalação automática de Rust e
  MSVC é candidata a TDR próprio.
- **macOS e Linux** — fora do alvo declarado. Tauri suporta os dois;
  habilitar depois é só adicionar `dmg`/`appimage` em `bundle.targets`
  e gerar build na plataforma correspondente (Tauri não cross-compila
  trivialmente).

### Aparência de "jogo nativo" no executável

O template configura a janela do bundle como **fullscreen sem
bordas** (`fullscreen: true`, `decorations: false`,
`resizable: false`) e injeta um pequeno bloqueador em
`index.html` que desabilita o menu de contexto e os atalhos de
WebView/browser (F5, F12, Ctrl+R, Ctrl+U, Ctrl+Shift+I/J/C)
apenas quando rodando dentro do Tauri (`__TAURI_INTERNALS__`).
No preview de desenvolvimento, o comportamento padrão do browser
fica intacto.

O objetivo é que o usuário final não consiga distinguir o jogo de
um executável nativo: sem barra de título, sem "Inspecionar
elemento", sem recarregar a página. Em release builds o devtools
já vem desligado pelo Tauri por padrão.

Sair do fullscreen é responsabilidade do jogo (botão "sair", Esc
tratado pelo `InputManager`, etc.) — o template não oferece UX
de saída pronta.

### Splash de marca "Cortex Game Engine"

Quando o jogo empacotado abre, mostra por ~2.5 s uma tela
"**Cortex Game Engine** — by BuuhV Projects" com logo geométrico,
e depois faz fade-out de 500 ms entrando no jogo. Implementado
direto no `index.html` do template:

- Markup `<div id="cortex-splash">` + estilos inline (sem dep externa
  pra não puxar fonte de CDN, sem JS extra).
- Logo = PNG embarcado como **data URI base64 inline** no
  `<img src="data:image/png;base64,...">` do template (cérebro
  estilizado com circuitos, gradient sky → indigo, 1024 × 1024
  transparente). Não vive em `public/logo.png` — embarcar inline
  garante que o asset não pode "sumir" do bundle por engano e que o
  template do projeto fica self-contained num único arquivo HTML.
  Dimensão renderizada 128 × 128 via classe `cortex-splash-logo`.
  Trade-off: o `index.html` fica ~1.9 MB. Otimização (TinyPNG /
  Squoosh) recomendada antes de releases — alvo < 200 KB.
- Ativação condicional: o script no `<head>` só adiciona a classe
  `cortex-splash--active` se `__TAURI_INTERNALS__` existir no
  `window` — ou seja, **só no bundle Tauri**. No preview de dev a
  div é renderizada com `display:none` e nunca aparece (evita ver
  splash 100 × por dia desenvolvendo).
- Comportamento: clique pula, `prefers-reduced-motion: reduce`
  desativa a animação de pulse no logo e a transição de fade.

Trade-off: cada jogo distribuído carrega o branding "Cortex" — é
intencional, faz parte do contrato "usou a engine, dá crédito".
Quem quiser remover edita o `<div id="cortex-splash">` do
`index.html` do projeto criado.

### Build debug com DevTools (opt-in)

O agente IA / dev às vezes precisa abrir DevTools no `.exe`
empacotado pra investigar erro de WebGL, falha de assets, exceção
não tratada. Em release default isso fica off — release real pro
usuário final não deve expor inspetor. Mas precisa de um caminho
**fácil e reversível** pra rodar uma build de debug pontual.

Solução adotada:

1. **`Cargo.toml`** do template ganha feature opcional:
   ```toml
   [features]
   default = []
   devtools = ["tauri/devtools"]
   ```
2. **`src/lib.rs`** abre devtools automaticamente quando a feature
   está ativa, via bloco `#[cfg(feature = "devtools")]`. Sem
   overhead no release default (o `setup` nem compila).
3. **`package.json`** ganha script `tauri:build:debug` que invoca
   `tauri build --features devtools`.
4. **Menu da IDE** ganha 2 itens:
   - **Gerar instalador...** (Ctrl+Shift+B) — release sem devtools.
   - **Gerar instalador (debug)...** (Ctrl+Shift+D) — debug com
     devtools abrindo automaticamente.
5. Bloqueio de F12/Ctrl+Shift+I no `index.html` continua ativo
   mesmo em debug — não atrapalha, porque a janela do DevTools
   já abre sozinha. Se fechar, o jeito de reabrir é rebuildar (ou
   comentar manualmente o keydown handler — debugging avançado).

Trade-off: a debug build tem ~50 KB de overhead pelo crate de
devtools incluído. Por isso o default é off — release pública não
carrega esse peso.

### Assets estáticos no build (plugin `cortex-copy-assets`)

Projetos costumam referenciar assets de áudio/modelo via string em
runtime (`loader.loadAudio('assets/x.mp3')`), não via `import`. O
Vite, em modo build, só copia pro `dist/`:
- arquivos referenciados por `import`/`import.meta.glob`,
- conteúdo de `public/` (root absoluto, sem prefixo).

Resultado: no `vite dev`, `assets/` é servido a partir da raiz e
funciona. Mas no `tauri:build`, o `dist/` resultante **não contém**
a pasta `assets/`, e o `.exe` falha com `EncodingError`,
`404 on /assets/...`, etc.

Solução adotada no `vite.config.ts` do template: plugin inline
`cortex-copy-assets` que, no hook `closeBundle`, copia
recursivamente `./assets/` pra `dist/assets/`. Sem dep externa
(usa `node:fs.cpSync`). No `apply: 'build'` — não roda em dev.

Trade-off vs. mover `assets/` pra `public/`: a convenção
`assets/` é mais legível pra dev (separa estáticos de público) e
casa com o padrão dos demos e do ADR-0022. O custo do plugin é
~10 linhas e roda uma vez por build.

### WebGL no WebView2

O `WebGLRenderer` do Three.js falhava ao iniciar dentro do bundle
Tauri (`Error: Error creating WebGL context`) por duas causas que
não acontecem em browser comum:

1. **WebView2 não força aceleração de hardware por padrão** —
   alguns drivers de GPU caem na blocklist do Chromium e o WebGL
   fica em software/falha. Resolução: `additionalBrowserArgs` no
   `tauri.conf.json` do template injeta
   `--ignore-gpu-blocklist --use-angle=d3d11
   --enable-features=Vulkan,UseSkiaRenderer`, forçando aceleração
   via Direct3D 11.
2. **Canvas com dimensão 0×0** quando o `WebGLRenderer` é criado.
   Em fullscreen sem decorations, o WebView2 inicializa antes da
   janela ter layout, e `canvas` herdava 0×0 do CSS antigo. O
   `index.html` do template agora define
   `html, body { width:100%; height:100% }` e
   `canvas { width:100%; height:100% }`, garantindo viewport
   válido desde o primeiro frame.

Projetos antigos (criados antes desse ajuste) precisam atualizar
manualmente o `tauri.conf.json` e o `index.html`. Re-rodar o
"Gerar instalador..." sozinho não corrige porque o setup não
sobrescreve esses arquivos no fluxo legado.

### Hardening em runtime (sem code signing)

Code signing fica para uma decisão futura (custo recorrente,
TDR próprio). Enquanto isso, o template ativa as defesas que
não dependem de cert:

1. **Content Security Policy estrita** no `tauri.conf.json`
   (`app.security.csp`). Diretivas principais:
   - `default-src 'self'` — bloqueia recurso externo por padrão.
   - `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`:
     - `'self'` cobre o bundle do Vite e o engine vendoriado.
     - `'unsafe-inline'` é necessário pelo script anti-tampering
       (bloqueador de context menu/F5/F12) embutido no `index.html`.
     - `'wasm-unsafe-eval'` libera plugins do Three que carregam WASM.
   - `connect-src 'self' ipc: http://ipc.localhost blob: data:` —
     restringe conexões ao próprio bundle + IPC do Tauri + URLs blob
     e data (Three.js GLTFLoader extrai texturas embutidas no GLB
     criando blobs via `URL.createObjectURL` e busca via `fetch` —
     sem `blob:` aqui as texturas falham e meshes ficam cinza).
     Bloqueia exfiltração pra servidores externos.
   - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
     `frame-ancestors 'none'` — fecham vetores clássicos de
     clickjacking / base-tag hijacking / form hijacking.
   - `img-src/font-src/media-src/worker-src` com `data:` e `blob:`
     pra texturas geradas em runtime, fontes embutidas e workers do
     Three.

2. **Bloqueador de UI WebView** (já documentado acima): impede
   menu de contexto, F12 e Ctrl+R em release builds.

3. **Fullscreen sem decorations**: reduz vetores de janela
   (drag/drop entre janelas, visual phishing baseado em
   sobreposição de barra de título).

Pra a IDE (Electron, distribuída para devs), as defesas estão no
`createWindow` — `webSecurity:true`,
`allowRunningInsecureContent:false`, `experimentalFeatures:false`,
e handlers `will-navigate` + `setWindowOpenHandler` que bloqueiam
navegação fora da origem do app e popups arbitrários. Toda
navegação externa precisa passar por `shell.openExternal` no main
process (explícito, auditável).

## Consequências

- **Positivo**: instalador ~10× menor que Electron, alinhado com
  distribuição via download direto.
- **Positivo**: a stack do jogo continua igual — TypeScript + Vite +
  Three.js + cortex-game-engine. Tauri é apenas a casca, não muda
  como o jogo é escrito nem como roda no preview do IDE.
- **Positivo**: o preview do IDE continua sendo o caminho rápido de
  iteração. Tauri é só para o passo "gerar `.exe` para distribuir".
- **Negativo**: adiciona dependência de toolchain Rust + MSVC Build
  Tools na máquina de quem vai gerar instalador. Documentado no README,
  mas é fricção real para quem nunca usou Rust.
- **Negativo**: o primeiro `tauri build` baixa e compila várias
  crates — pode levar 5–10 minutos. Builds subsequentes usam cache
  (~30s). Aceitável dado que gerar instalador não é operação de loop.
- **Negativo**: sem code signing, SmartScreen vai assustar usuários
  finais que baixarem do site. OK pra teste, não pra produção.
- **Aberto**: validar que o WebGL/WebGPU do WebView2 atende a um jogo
  Three.js com pós-processamento e split-screen (ADR-0023). Em teoria
  sim — WebView2 é Chromium recente. Confirmar empiricamente no
  primeiro build.

## Referências

- ADR-0009 — Vendoring engine inline (define como `vendor/` chega no
  projeto, que o `tauri build` precisa estar presente para o `dist/`
  conter o engine).
- ADR-0022 — Padrão arquitetural de projetos criados pelo IDE
  (define a estrutura na qual `src-tauri/` se encaixa).
- ADR-0023 — Split-screen e gamepad no engine (capacidades do
  runtime que precisam funcionar dentro do WebView2).
