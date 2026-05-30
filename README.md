# cortex-game-engine

IDE Electron + motor de jogos 3D em TypeScript com arquitetura
Entity-Component-System (ECS) e renderização via Three.js. Os jogos são
criados, editados e testados na própria IDE; o build final é empacotado
como instalador Windows com Tauri (ver [ADR-0024](docs/adrs/0024-instalador-final-com-tauri.md)).

## Rodar a IDE em desenvolvimento

```bash
yarn install
yarn electron:dev
```

## Criar e abrir projetos

- **Novo projeto**: clicar **+ Novo Projeto** na sidebar — pede pasta e
  nome, copia o template, vendoriza o engine e roda `yarn install`
  automaticamente (ADR-0013).
- **Abrir projeto existente**: botão **Abrir Projeto** logo abaixo —
  abre o diálogo nativo do SO. Persiste no localStorage; abre
  automaticamente da próxima vez.

## Gerar instalador do jogo (Windows)

Cada projeto criado pela IDE pode ser empacotado como `.exe` instalador
NSIS via **Tauri 2** (ADR-0024). Projetos novos já saem configurados;
projetos antigos a IDE configura na hora.

### Pré-requisitos (uma vez por máquina)

Instalar manualmente — a IDE não baixa automaticamente nesta versão:

1. **Rust toolchain** → [rustup.rs](https://rustup.rs/)
   Baixar `rustup-init.exe` e executar com defaults. Necessário pra
   compilar a casca Tauri.
2. **Microsoft C++ Build Tools** → [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   No instalador, marcar **"Desktop development with C++"**. Tauri
   precisa do linker MSVC pra gerar o `.exe`.
3. **WebView2 Runtime** → [developer.microsoft.com/microsoft-edge/webview2](https://developer.microsoft.com/microsoft-edge/webview2/)
   Já vem instalado no Windows 11 e no Windows 10 recente. Se faltar,
   baixar o **Evergreen Bootstrapper**.

Validar Rust no terminal:

```bash
cargo --version
rustc --version
```

### Fluxo na IDE

1. Abrir o projeto na IDE.
2. **Menu → Projeto → Gerar instalador...** (atalho `Ctrl+Shift+B`).
   - Se for projeto antigo (sem `src-tauri/`), a IDE pergunta e
     configura na hora: copia o esqueleto Tauri, gera **ícones
     placeholder** (cinza-azulado), mescla os scripts no
     `package.json` e roda `yarn install`.
3. Clicar **Gerar instalador...** de novo. O `.exe` sai em:
   ```
   src-tauri/target/release/bundle/nsis/<NOME>_0.0.1_x64-setup.exe
   ```
4. **Trocar pelos ícones reais quando tiver a arte**:
   ```bash
   yarn tauri icon caminho/para/icone.png
   ```
   PNG quadrado, idealmente 1024×1024. Sobrescreve os placeholders.

### Limitações conhecidas (ADR-0024)

- **Sem code signing** — o SmartScreen do Windows vai exibir
  "Editor desconhecido" no primeiro execute. Aceito enquanto for
  teste; certificado vira decisão própria quando publicar.
- **Sem auto-update** — toda atualização do jogo = novo download
  manual do instalador.
- **Só Windows** — macOS/Linux fora do alvo declarado.

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| [src/](src/) | Código do engine (core, ecs, ai). Vendorizado em cada projeto. |
| [electron/](electron/) | IDE: main process, preload, renderer, agente IA. |
| [templates/new-project/](templates/new-project/) | Esqueleto copiado em cada projeto novo. |
| [docs/adrs/](docs/adrs/) | Decisões arquiteturais numeradas. |
| [tests/](tests/) | Testes vitest do engine. |

## Decisões importantes

Os ADRs em [docs/adrs/](docs/adrs/) registram cada decisão grande. Os
mais relevantes pra entender a forma do projeto:

- **[ADR-0001](docs/adrs/0001-renderizador-threejs.md)** — Three.js como renderer.
- **[ADR-0002](docs/adrs/0002-arquitetura-ecs.md)** — ECS como modelo de jogo.
- **[ADR-0009](docs/adrs/0009-vendoring-engine-em-projetos-criados.md)** — Vendoring do engine nos projetos.
- **[ADR-0021](docs/adrs/0021-agente-deve-preferir-engine-sobre-three-direto.md)** — Agente IA usa engine, não Three direto.
- **[ADR-0022](docs/adrs/0022-padrao-arquitetural-de-projetos-criados.md)** — Padrão de pastas dos projetos.
- **[ADR-0023](docs/adrs/0023-split-screen-e-gamepad-no-engine.md)** — Split-screen e gamepad.
- **[ADR-0024](docs/adrs/0024-instalador-final-com-tauri.md)** — Instalador final com Tauri.
