# Instalação

A IDE distribuída como app desktop ainda não está pronta — por
enquanto se roda em modo de desenvolvimento direto do repo.

## Pré-requisitos da IDE

- **Node.js 18+** — recomendado via [Volta](https://volta.sh) ou
  [nvm](https://github.com/nvm-sh/nvm).
- **Yarn classic (1.x)** — `npm install -g yarn`.
- **Git** — para clonar o repo.

## Pré-requisitos para gerar instalador do jogo (Windows)

<div class="callout callout-warn">

**Importante.** Para empacotar o jogo como `.exe` distribuível, é
obrigatório instalar **Rust** e **MSVC Build Tools** na máquina
antes de clicar "Gerar instalador" pela primeira vez. A IDE não
baixa esses pré-requisitos automaticamente.

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
não acha, fecha a IDE completamente (incluindo o `electron:dev` pai)
e reabre. Processos em execução não veem mudanças de PATH feitas
depois que iniciaram.

</div>

## Pré-requisitos para usar a IA

Ver [Chat IA](#chat-ia) — a IDE usa a assinatura do **Claude Code**
do seu computador, então o login é feito uma vez via CLI.

## Rodar a IDE

```bash
git clone <repo>
cd cortex-game-engine
yarn install
yarn electron:dev
```

Na primeira vez o `electron:dev` faz o build do engine (`tsc`) antes
de subir o app — pode levar ~30 segundos.

## Criar projeto

Dentro da IDE:

1. Clicar **+ Novo Projeto** na sidebar.
2. Escolher pasta de destino e nome.
3. A IDE copia o template, vendoriza o engine em
   `vendor/cortex-game-engine/` e roda `yarn install` automaticamente.

Pronto — o projeto abre, o preview liga e você pode editar.
