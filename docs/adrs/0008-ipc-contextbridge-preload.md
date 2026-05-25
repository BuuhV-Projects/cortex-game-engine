# 0004 - IPC via contextBridge + preload (sem nodeIntegration)

**Data:** 2026-05-25
**Status:** aceito

## Contexto

Electron permite que o processo renderer acesse Node.js de duas formas:

| Modo | Como | Risco |
|---|---|---|
| `nodeIntegration: true` | `require('fs')` direto no renderer | Alto — qualquer XSS tem acesso total ao sistema de arquivos |
| `contextBridge` + preload | APIs explicitamente expostas via `contextBridge.exposeInMainWorld` | Baixo — superfície mínima e controlada |

O renderer carrega código gerado por terceiros (o jogo do usuário pode ter dependências); manter
`contextIsolation: true` e `nodeIntegration: false` é a prática recomendada pela documentação
oficial do Electron desde v12+.

## Decisão

- `webPreferences.nodeIntegration = false`
- `webPreferences.contextIsolation = true`
- `webPreferences.preload = path.join(__dirname, 'preload.js')`

O arquivo `electron/preload.ts` expõe `window.electronAPI` com as operações necessárias:

```typescript
interface ElectronAPI {
  readDir(dirPath: string): Promise<FileEntry[]>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  createProject(targetDir: string, name: string): Promise<string>; // retorna path do projeto
  runProject(projectDir: string): Promise<void>; // spawna vite
  stopProject(): Promise<void>;
  onLog(callback: (line: string) => void): void;
  onProjectStopped(callback: () => void): void;
}
```

Cada handler IPC no main process (`ipcMain.handle`) valida o path recebido para impedir
path traversal fora do diretório de projetos.

## Consequências

- Toda nova operação de sistema de arquivos ou processo precisa ser explicitamente adicionada
  ao preload e ao main — mais verboso, mas auditável.
- Impossibilita acesso acidental ao Node.js direto do renderer, protegendo contra
  scripts de jogo maliciosos rodando no preview WebView.
- O tipo `ElectronAPI` deve ser declarado em `electron/renderer/electron.d.ts` para TypeScript
  ter IntelliSense no renderer sem referenciar `electron` diretamente.
