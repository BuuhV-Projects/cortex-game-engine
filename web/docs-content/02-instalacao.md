# Instalação

A IDE é distribuída como **instalador desktop pronto** — basta
baixar e executar. Você não precisa clonar o repositório nem ter o
código-fonte na máquina pra usar.

## Pré-requisitos

Antes de instalar a IDE, garanta que estes componentes estão na sua
máquina:

| Componente | Onde instalar | Pra que serve |
|---|---|---|
| **Node.js 18+** | [nodejs.org](https://nodejs.org/) ou via [Volta](https://volta.sh) / [nvm](https://github.com/nvm-sh/nvm) | Rodar o `vite` que faz o preview ao vivo do jogo dentro da IDE. |
| **Yarn classic (1.x)** | `npm install -g yarn` (depois de ter o Node) | Gerenciar dependências dos projetos criados (a IDE roda `yarn install` automaticamente em projeto novo). |
| **Blender** | [blender.org/download](https://www.blender.org/download/) | Gerar modelos 3D com IA (`.glb`) a partir de descrição em linguagem natural. Detalhes em [Blender](#blender). |
| **Claude Code** | [claude.com/product/claude-code](https://claude.com/product/claude-code) | Autenticação do chat IA — a IDE usa a sua assinatura Claude Pro/Max detectada via CLI. Detalhes em [Chat IA](#chat-ia). |

Os 4 são **obrigatórios**: a IDE é uma combinação de editor + preview
ao vivo + chat IA + gerador de assets, e cada peça depende de um
desses componentes.

## Baixar e instalar a IDE

1. Ir até a página de [releases no GitHub](https://github.com/BuuhV-Projects/cortex-game-engine/releases).
2. Baixar o instalador da sua plataforma na release mais recente:
   - **Windows** — `.exe` (NSIS).
   - **macOS** — `.dmg`.
   - **Linux** — `.AppImage`.
3. Executar o instalador e seguir o wizard.

<div class="callout callout-info">

**Releases são automáticas.** Cada merge na `main` que traz uma
feature ou fix dispara o `semantic-release`: ele lê os Conventional
Commits (`feat:`, `fix:`, `feat!:`), decide o bump de versão, atualiza
o `CHANGELOG.md` e cria a release com os 3 instaladores anexados.
Você sempre tem a versão mais nova disponível minutos depois do
merge.

</div>

## Pré-requisitos para gerar instalador do jogo (Windows)

<div class="callout callout-warn">

**Importante.** Para empacotar o seu **jogo** como `.exe` distribuível
(Menu → Projeto → Gerar instalador...), é obrigatório instalar
**Rust** e **MSVC Build Tools** na máquina antes de clicar pela
primeira vez. A IDE não baixa esses pré-requisitos automaticamente.
Isso é separado dos pré-requisitos da IDE acima.

</div>

Os três componentes que precisam estar instalados:

| Componente | Onde instalar | Observação |
|---|---|---|
| **Rust toolchain** | [rustup.rs](https://rustup.rs/) | Baixar `rustup-init.exe` e rodar com defaults. Adiciona `cargo` e `rustc` ao PATH. |
| **MSVC Build Tools** | [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) | No instalador, marcar **"Desktop development with C++"**. É o linker que o Rust usa pra gerar o `.exe`. |
| **WebView2 Runtime** | [developer.microsoft.com/microsoft-edge/webview2](https://developer.microsoft.com/microsoft-edge/webview2/) | Já vem no Windows 11 e Windows 10 recente. Se faltar, baixar o **Evergreen Bootstrapper**. |

Validar Rust no terminal:

```bash
cargo --version
rustc --version
```

<div class="callout callout-info">

**Dica.** Se o `cargo --version` funciona no PowerShell mas a IDE
não acha, fecha a IDE completamente e reabre. Processos em execução
não veem mudanças de PATH feitas depois que iniciaram.

</div>

## Criar projeto

Dentro da IDE:

1. Clicar **+ Novo Projeto** na sidebar.
2. Escolher pasta de destino e nome.
3. A IDE copia o template, vendoriza o engine em
   `vendor/cortex-game-engine/` e roda `yarn install`
   automaticamente — por isso o pré-requisito de **Yarn 1.x**.

Pronto — o projeto abre, o preview liga e você pode editar.

## Rodar a partir do código-fonte (opcional)

Se você quer contribuir com o engine ou a IDE, aí sim faz sentido
clonar o repo:

```bash
git clone https://github.com/BuuhV-Projects/cortex-game-engine.git
cd cortex-game-engine
yarn install
yarn electron:dev
```

Mas pra apenas **usar** a IDE, instalar pelo release é o caminho
recomendado.
