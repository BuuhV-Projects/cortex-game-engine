# 0002 - Monaco Editor para edição de código

**Data:** 2026-05-25
**Status:** aceito

## Contexto

A UI precisa de um editor de código embutido que suporte TypeScript com realce de sintaxe,
IntelliSense e navegação. As alternativas avaliadas:

| Opção | Prós | Contras |
|---|---|---|
| **Monaco Editor** | Mesmo núcleo do VS Code, suporte TypeScript de primeira classe, API rica | ~2 MB no bundle do renderer, worker threads complexos |
| **CodeMirror 6** | Leve (~500 KB), modular, bom desempenho | IntelliSense TypeScript exige plugins extras e configuração manual |
| **textarea simples** | Zero dependências | Nenhuma feature de IDE — inaceitável para o caso de uso |

O projeto já tem como público-alvo desenvolvedores que usam TypeScript; oferecer IntelliSense
real (completions, erros em tempo real via `tsserver`) é um diferencial direto do PRD de "UI
para codar". Monaco atende isso nativamente pois embute o `monaco-editor/esm` com workers TypeScript.

## Decisão

Usar **Monaco Editor** (`monaco-editor` npm package) carregado no processo renderer via
`electron-vite`. O loader de workers será configurado via `vite-plugin-monaco-editor` para
gerar os web workers corretamente no build Electron.

O editor receberá o modelo de arquivo ativo (path + conteúdo) via evento interno do renderer e
salvará via `window.electronAPI.writeFile(path, content)` ao `Ctrl+S`.

## Consequências

- ~2 MB adicionais no bundle do renderer (aceitável em ambiente desktop).
- É necessário adicionar `monaco-editor` e `vite-plugin-monaco-editor` como dependências.
- Para IntelliSense completo é preciso configurar o `MonacoEnvironment.getWorkerUrl` apontando
  para os workers gerados pelo plugin — tarefa de configuração única.
- Funcionalidades avançadas como "go to definition" cross-file ficam para iterações futuras.
