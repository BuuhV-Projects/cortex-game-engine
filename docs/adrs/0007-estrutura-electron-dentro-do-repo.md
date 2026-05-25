# 0007 - Diretório `electron/` dentro do repositório do motor

**Data:** 2026-05-25
**Status:** substituído parcialmente por [ADR-0009](0009-vendoring-engine-em-projetos-criados.md)

> **Nota:** a decisão de hospedar o código Electron em `electron/` continua
> válida. O que mudou foi a estrutura de build: `electron-vite` agora emite
> em `out/` (não `dist-electron/`) e em ESM (não CommonJS). O preload é
> servido como `out/preload/index.mjs`. Veja ADR-0009 para detalhes do
> pipeline atualizado.

## Contexto

É preciso decidir onde hospedar o código da UI Electron:

1. **Repositório separado** — total isolamento, deploy independente.
2. **Pacote monorepo** (ex.: `packages/ui/`) — separação formal, mas mesma raiz git.
3. **Subdiretório `electron/`** no repo `cortex-game-engine` — zero overhead de monorepo, importação direta dos tipos do motor.

O motor é uma biblioteca TypeScript; a UI precisa importar tipos (`World`, `Scene`, `GameLoop`,
etc.) para exibir inspeção de entidades e autocompletar na geração de scripts. Com repositórios
separados ou pacotes monorepo esse import exigiria publicação no npm ou symlinks via workspace —
complexidade desnecessária nesta fase.

## Decisão

O código Electron vive em **`electron/`** dentro de `cortex-game-engine/`:

```
cortex-game-engine/
├── electron/
│   ├── main.ts          # Processo principal
│   ├── preload.ts       # contextBridge
│   ├── tsconfig.json    # CommonJS/Node target (exigido pelo Electron main)
│   └── renderer/
│       ├── index.html
│       ├── main.ts      # Entry point SPA
│       ├── styles.css
│       ├── Editor.ts    # Monaco wrapper
│       ├── FileTree.ts  # Explorador de arquivos
│       └── Preview.ts   # Painel de preview/run
├── templates/
│   └── new-project/     # Scaffold de projeto novo
│       ├── index.html
│       ├── main.ts
│       └── package.json
└── electron.vite.config.ts
```

O `electron-vite` gerencia dois targets de build:
- **main + preload**: compilados para CommonJS, saída em `dist-electron/`.
- **renderer**: SPA Vite, saída em `dist-electron/renderer/`.

## Consequências

- Importar código do motor no renderer é um simples `import { World } from '../../src/index.js'`.
- O `tsconfig.json` raiz continua servindo apenas para a biblioteca; o `electron/tsconfig.json`
  tem `module: CommonJS` conforme exigido pelo processo main do Electron.
- O script `build` existente (compila a lib) não é afetado; novos scripts `electron:dev` e
  `electron:build` são adicionados ao `package.json`.
