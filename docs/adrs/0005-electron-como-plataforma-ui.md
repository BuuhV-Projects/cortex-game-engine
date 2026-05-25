# 0001 - Electron como plataforma da UI desktop

**Data:** 2026-05-25
**Status:** aceito

## Contexto

O PRD solicita uma UI para criar e gerenciar projetos usando o motor `cortex-game-engine`.
As alternativas consideradas foram:

| Opção | Prós | Contras |
|---|---|---|
| **Electron** | Acesso nativo ao Node.js (fs, child_process, vite dev server), ecossistema maduro, Monaco Editor nativo | Bundle grande (~150 MB) |
| **Tauri** | Bundle pequeno (~10 MB), mais seguro | Backend em Rust — impede reutilizar código do motor Node.js diretamente |
| **App web (Vite + browser)** | Zero instalação | Sem acesso ao sistema de arquivos real, não pode spawnar processos |

O motor já depende de Node.js (`@anthropic-ai/sdk`, `commander`), o Renderer usa WebGL via Three.js,
e o fluxo de "rodar um projeto" requer spawnar `vite` como processo filho — todas necessidades
naturalmente atendidas pelo Electron.

## Decisão

Usar **Electron** como shell da UI desktop. O app será estruturado com:

- **Main process** (`electron/main.ts`): cria a janela, registra handlers IPC, spawna processos externos.
- **Preload** (`electron/preload.ts`): ponte segura de APIs para o renderer via `contextBridge`.
- **Renderer** (`electron/renderer/`): HTML/CSS/TypeScript, serve como SPA compilada pelo `electron-vite`.

A ferramenta de build é **electron-vite** porque já integra Vite (que o motor usa para a demo),
unificando o toolchain e aproveitando HMR no desenvolvimento.

## Consequências

- Bundle de distribuição maior (~150 MB com Electron embutido), aceitável para uma ferramenta de desenvolvimento.
- O motor pode ser importado diretamente no main process ou no renderer sem adaptações — sem camadas extras.
- Futuras features que requeiram acesso ao sistema de arquivos ou processos nativos são triviais de adicionar.
- Adicionar `electron` e `electron-vite` como `devDependencies` no `cortex-game-engine/package.json`.
