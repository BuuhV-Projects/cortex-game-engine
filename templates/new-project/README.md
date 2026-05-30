# {{PROJECT_NAME}}

Projeto criado com `cortex-game-engine` — motor de jogos 3D em TypeScript
com arquitetura ECS (Entity-Component-System).

## Estrutura

```
.
├── components/   Só dados — classes que estendem Component
├── systems/      Só lógica — classes que estendem System
├── entities/     Factories — funções que montam entities com Components
├── scenes/       Setup de cena/level (cria entities, registra systems)
├── assets/       .glb, .gltf, texturas, sons (não TypeScript)
├── utils/        Helpers genéricos do projeto
├── main.ts       Bootstrap: World + GameLoop + Renderer + cena inicial
├── index.html
└── vendor/cortex-game-engine/  Motor vendoriado
```

Cada pasta tem seu próprio `README.md` com convenções específicas e
exemplos. Quando crescer, agrupar por feature (`features/player/`,
`features/enemies/`) pode fazer sentido — mas pra começar, separação
por categoria é mais simples.

## Regras importantes

1. **Component só com dados** — campos públicos, sem métodos que mutam
   outras entities. Lógica vai em System.
2. **System sem estado interno** — estado pertence a Components.
3. **Composição > herança em Components** — "Inimigo voador" =
   `EnemyComponent` + `FlyingComponent`, não `class FlyingEnemy`.
4. **Não importar `three` direto** — use exports do
   `cortex-game-engine`. Se faltar algo, pedir pra estender o motor.
5. **Um arquivo por classe** — `PositionComponent.ts` exporta apenas
   `PositionComponent`.

## Rodar

```bash
yarn install   # primeira vez
yarn dev       # sobe vite com hot reload
```

Ou use o botão **▶ Play** no IDE.

## Gerar instalador (Windows)

O projeto vem com **Tauri 2** configurado para empacotar o jogo como um
`.exe` instalador Windows (NSIS). Decisão e tradeoffs em
[ADR-0024](../../docs/adrs/0024-instalador-final-com-tauri.md).

### Pré-requisitos (uma vez por máquina)

1. **Rust toolchain** — instalar via [rustup.rs](https://rustup.rs/).
2. **Microsoft C++ Build Tools** — Tauri precisa do MSVC para linkar.
   Baixar em [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   e marcar "Desktop development with C++" no instalador.
3. **WebView2** — já vem instalado no Windows 11 e no Windows 10
   recente. Se não tiver, baixar o "Evergreen Bootstrapper" em
   [developer.microsoft.com/microsoft-edge/webview2](https://developer.microsoft.com/microsoft-edge/webview2/).

### Ícones do app (uma vez por projeto)

Antes do primeiro build, gerar os ícones a partir de um PNG quadrado
(idealmente 1024×1024):

```bash
yarn tauri icon caminho/para/icone.png
```

O comando preenche `src-tauri/icons/` com todos os tamanhos que o
`tauri.conf.json` espera. Sem isso o `tauri build` falha procurando
`icons/icon.ico`.

### Build

```bash
yarn tauri:build
```

O resultado fica em
`src-tauri/target/release/bundle/nsis/{{PROJECT_NAME}}_0.0.1_x64-setup.exe`.
É esse arquivo que você distribui — o usuário final só precisa rodar.

### Modo dev nativo (opcional)

```bash
yarn tauri:dev
```

Abre o jogo numa janela nativa (não no browser), com hot reload do
Vite. Útil para testar comportamento de janela, atalhos de teclado e
gamepad fora do contexto do navegador. O preview do IDE continua sendo
o caminho rápido para iteração.
