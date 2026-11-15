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
| **Claude Code 2.0+** | [claude.com/product/claude-code](https://claude.com/product/claude-code) | The Studio's AI. Required only for the AI part — the Studio registers the `cortex` MCP in it. Details in [AI with Claude Code](#ai-claude-code). |
| **Blender 4.0+** (recommended) | [blender.org/download](https://www.blender.org/download/) | Model thumbnails and measurements (`inspect_assets`), auto-rig, and the scripts the AI writes to create or tweak `.glb` files. Details in [Blender](#blender). |
| **Git** (recommended) | [git-scm.com](https://git-scm.com/) | Initial commit of a new project and the Git Bash used by auto-rig. |

The editor (scene, Inspector, preview and export) works without
Claude Code, Blender and Git — only the AI and the features listed in
the table depend on them.

<div class="callout callout-info">

**Install Claude Code before the Studio.** At the end of the
installation, the Studio installer checks Claude Code, Blender and
Git, shows a report with what it found and what's missing (also saved
to `<Studio folder>\requisitos.txt`) and registers the `cortex` MCP
in Claude Code by itself. If you install Claude Code later, the
manual registration command is in [AI with Claude Code](#ai-claude-code).

</div>

## Download and install the IDE

1. Go to the [GitHub releases page](https://github.com/BuuhV-Projects/cortex-studio-releases/releases/latest).
2. Download the installer for your platform from the latest release:
   - **Windows** — `.exe` (NSIS).
   - **macOS** — `.dmg`.
   - **Linux** — `.AppImage`.
3. Run the installer and follow the wizard. At the end, check the
   prerequisites report it shows.

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
