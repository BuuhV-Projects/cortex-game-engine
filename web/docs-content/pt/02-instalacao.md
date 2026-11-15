# Instalação

A IDE é distribuída como **instalador desktop pronto** — basta
baixar e executar. Você não precisa clonar o repositório nem ter o
código-fonte na máquina pra usar.

## Pré-requisitos

Antes de instalar a IDE, garanta que estes componentes estão na sua
máquina:

| Componente | Onde instalar | Pra que serve |
|---|---|---|
| **Node.js 24+** | [nodejs.org](https://nodejs.org/) ou via [Volta](https://volta.sh) / [nvm](https://github.com/nvm-sh/nvm) | Rodar o `vite` que faz o preview ao vivo do jogo dentro da IDE. |
| **Yarn classic (1.x)** | `npm install -g yarn` (depois de ter o Node) | Gerenciar dependências dos projetos criados (a IDE roda `yarn install` automaticamente em projeto novo). |
| **Claude Code 2.0+** | [claude.com/product/claude-code](https://claude.com/product/claude-code) | A IA do Studio. Obrigatório só para a parte de IA — o Studio registra nele o MCP `cortex`. Detalhes em [IA com Claude Code](#ia-claude-code). |
| **Blender 4.0+** (recomendado) | [blender.org/download](https://www.blender.org/download/) | Thumbnails e medidas de modelos (`inspect_assets`), auto-rig e os scripts que a IA escreve para criar ou ajustar `.glb`. Detalhes em [Blender](#blender). |
| **Git** (recomendado) | [git-scm.com](https://git-scm.com/) | Commit inicial do projeto novo e o Git Bash usado pelo auto-rig. |

O editor (cena, Inspector, preview e export) funciona sem Claude
Code, Blender e Git — só a IA e as funções citadas na tabela
dependem deles.

<div class="callout callout-info">

**Instale o Claude Code antes do Studio.** No fim da instalação, o
instalador do Studio checa Claude Code, Blender e Git, mostra um
relatório com o que achou e o que falta (salvo também em
`<pasta do Studio>\requisitos.txt`) e registra o MCP `cortex` no
Claude Code sozinho. Se instalar o Claude Code depois, o comando de
registro manual está em [IA com Claude Code](#ia-claude-code).

</div>

## Baixar e instalar a IDE

1. Ir até a página de [releases no GitHub](https://github.com/BuuhV-Projects/cortex-studio-releases/releases/latest).
2. Baixar o instalador da sua plataforma na release mais recente:
   - **Windows** — `.exe` (NSIS).
   - **macOS** — `.dmg`.
   - **Linux** — `.AppImage`.
3. Executar o instalador e seguir o wizard. No final, confira o
   relatório de requisitos que ele mostra.

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
