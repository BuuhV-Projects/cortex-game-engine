# Installation

The IDE ships as a **ready-to-install desktop app** — just download
and run. You don't need to clone the repository or have the source
code on your machine to use it.

## Prerequisites

Before installing the IDE, make sure you have these components on
your machine:

| Component | Where to install | What it's for |
|---|---|---|
| **Node.js 24+** | [nodejs.org](https://nodejs.org/) or via [Volta](https://volta.sh) / [nvm](https://github.com/nvm-sh/nvm) | Runs the `vite` that powers the live preview inside the IDE. |
| **Yarn classic (1.x)** | `npm install -g yarn` (after Node) | Manages dependencies of created projects (the IDE auto-runs `yarn install` on new projects). |
| **Blender** | [blender.org/download](https://www.blender.org/download/) | Generate 3D models with AI (`.glb`) from natural language. Details in [Blender](#blender). |
| **Claude Code** | [claude.com/product/claude-code](https://claude.com/product/claude-code) | AI chat authentication — the IDE uses your Claude Pro/Max subscription detected via the CLI. Details in [AI Chat](#chat-ia). |

All 4 are **required**: the IDE combines editor + live preview +
AI chat + asset generator, and each piece depends on one of these
components.

## Download and install the IDE

1. Go to the [GitHub releases page](https://github.com/BuuhV-Projects/cortex-game-engine/releases).
2. Download the installer for your platform from the latest release:
   - **Windows** — `.exe` (NSIS).
   - **macOS** — `.dmg`.
   - **Linux** — `.AppImage`.
3. Run the installer and follow the wizard.

<div class="callout callout-info">

**Releases are automatic.** Every merge to `main` that brings a
feature or fix triggers `semantic-release`: it reads Conventional
Commits (`feat:`, `fix:`, `feat!:`), decides the version bump,
updates `CHANGELOG.md` and creates the release with the 3 installers
attached. The latest version is always available minutes after merge.

</div>

## Prerequisites to ship a game installer (Windows)

<div class="callout callout-warn">

**Important.** To package your **game** as a distributable `.exe`
(Project → Generate installer...), you must install **Rust** and
**MSVC Build Tools** on your machine before clicking for the first
time. The IDE does not download these prerequisites automatically.
This is separate from the IDE prerequisites above.

</div>

The three components that need to be installed:

| Component | Where to install | Note |
|---|---|---|
| **Rust toolchain** | [rustup.rs](https://rustup.rs/) | Download `rustup-init.exe` and run with defaults. Adds `cargo` and `rustc` to PATH. |
| **MSVC Build Tools** | [visualstudio.microsoft.com/visual-cpp-build-tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) | In the installer, check **"Desktop development with C++"**. It's the linker Rust uses to generate the `.exe`. |
| **WebView2 Runtime** | [developer.microsoft.com/microsoft-edge/webview2](https://developer.microsoft.com/microsoft-edge/webview2/) | Ships with Windows 11 and recent Windows 10. If missing, download the **Evergreen Bootstrapper**. |

Validate Rust in the terminal:

```bash
cargo --version
rustc --version
```

<div class="callout callout-info">

**Tip.** If `cargo --version` works in PowerShell but the IDE can't
find it, close the IDE completely and reopen. Running processes don't
see PATH changes made after they started.

</div>

## Create a project

Inside the IDE:

1. Click **+ New Project** in the sidebar.
2. Choose target folder and name.
3. The IDE copies the template, vendors the engine into
   `vendor/cortex-game-engine/` and runs `yarn install`
   automatically — that's why **Yarn 1.x** is a prerequisite.

Done — the project opens, the preview starts and you can edit.

## Run from source (optional)

If you want to contribute to the engine or the IDE, then it makes
sense to clone the repo:

```bash
git clone https://github.com/BuuhV-Projects/cortex-game-engine.git
cd cortex-game-engine
yarn install
yarn electron:dev
```

But to just **use** the IDE, installing from a release is the
recommended path.
