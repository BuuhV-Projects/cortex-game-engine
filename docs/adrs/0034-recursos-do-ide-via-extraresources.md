# 0034 - Recursos do IDE empacotados via extraResources (não no app.asar)

**Data:** 2026-05-31
**Status:** aceito

## Contexto

O IDE lê do disco, via `fs`, um conjunto de recursos para criar projetos e
alimentar o IntelliSense do Monaco:

- `dist-engine/index.js` — bundle do engine vendorizado em cada projeto.
- `dist/src/**/*.d.ts` + `dist/src/vite/sceneSavePlugin.js` — types do engine e
  o plugin de Vite, copiados para `vendor/cortex-game-engine/` do projeto.
- `templates/new-project/**` — template base do projeto.
- `node_modules/@types/three/**/*.d.ts` — types reais do three, lidos pelo
  `engine:readTypes` para resolver os tipos usados pelo engine no editor.

O [ADR-0009](0009-vendoring-engine-em-projetos-criados.md) registrava que esses
recursos iriam para o `app.asar` via `files` (e, depois, `asarUnpack` para o
`fs.cp` conseguir lê-los, já que `cp` não lê de dentro do asar).

**Essa abordagem não funciona.** Ao gerar o instalador, criar um projeto falhava
com:

```
Error invoking remote method 'fs:createProject': ENOENT: no such file or
directory, lstat '...\resources\app.asar.unpacked\...\GameLoop.d.ts'
```

Investigando o `app-builder-lib`:

1. **`.d.ts` são removidos incondicionalmente do asar.** A lista `excludedExts`
   em `app-builder-lib/out/fileMatcher.js` inclui `d.ts`, e o matcher dá
   `patterns.push("!**/*.{…,d.ts,…}")` **depois** de qualquer padrão do usuário.
   Como a última regra que casa vence, nenhum padrão em `files`/`asarUnpack`
   consegue empacotar `.d.ts` — todos somem (mantêm-se `.js`, `.js.map` e
   `.d.ts.map`, só o `.d.ts` é descartado). Ver issue
   electron-userland/electron-builder#7512. Essa exclusão é aplicada **apenas**
   ao fileset `"files"` (`getMainFileMatchers`), não a `extraResources`.
2. **`@types/three` é devDependency** → o electron-builder faz pruning das
   devDependencies do `node_modules` empacotado, então seus `.d.ts` também
   nunca chegavam ao build.

Ou seja, no IDE empacotado o vendoring e o IntelliSense estavam quebrados; só
funcionava em dev (lendo da raiz do repo).

## Decisão

Esses recursos saem do `app.asar` e passam a ser copiados via
`electron-builder.json#extraResources`, que grava árvores reais em `resources/`
**sem** strip de `.d.ts` e **sem** pruning de devDeps:

```json
"files": ["out/**"],
"extraResources": [
  { "from": "templates", "to": "templates" },
  { "from": "dist-engine", "to": "dist-engine" },
  { "from": "docs/cortex-game-engine/engine-api.md",
    "to": "docs/cortex-game-engine/engine-api.md" },
  { "from": "dist/src", "to": "dist/src", "filter": ["**/*.d.ts", "**/*.js"] },
  { "from": "node_modules/@types/three", "to": "node_modules/@types/three",
    "filter": ["**/*.d.ts", "package.json"] }
]
```

> A doc da API (`engine-api.md`) entra aqui porque o `vendorEngine` a copia pra
> cada projeto criado como `vendor/cortex-game-engine/API.md` — o Chat IA lê ela
> dentro do projeto (e ela viaja com o projeto, inclusive pro build Tauri).

Os destinos preservam os mesmos subpaths que existem na raiz do repo em dev
(`dist/src`, `dist-engine`, `templates`, `node_modules/@types/three`).

A `resourceBase()` no main process passa a apontar para `process.resourcesPath`
em produção (antes mapeava para `app.asar.unpacked`):

```ts
function resourceBase(): string {
  const appPath = app.getAppPath()
  return appPath.endsWith('.asar') ? process.resourcesPath : appPath
}
```

Com isso o mesmo `join(resourceBase(), 'dist', 'src', …)` resolve em dev (raiz do
repo) e em prod (`resources/`). O `engine:readTypes` também passou a usar
`resourceBase()` (antes lia de `app.getAppPath()`, isto é, de dentro do asar).

`asarUnpack` foi removido: nada mais precisa ser desempacotado, pois o asar agora
só contém `out/**` (código do app) + node_modules de produção.

Substitui o trecho de **Empacotamento** do [ADR-0009](0009-vendoring-engine-em-projetos-criados.md).

## Consequências

- Criar projeto e IntelliSense passam a funcionar no instalador, não só em dev.
- Os recursos ficam visíveis em `resources/` (fora do asar) — levemente menos
  "fechado", mas são assets de autoria, não segredo.
- `@types/three` (~946 `.d.ts`) é copiado para `resources/node_modules/@types/three`;
  some do pruning porque agora é um fileset explícito, não uma dependência.
- Regra prática: **todo recurso lido via `fs` pelo main process deve ir em
  `extraResources`**, nunca depender de `.d.ts` dentro do `app.asar`.
- `fs.cp` continua não lendo de dentro do asar — mais um motivo para esses
  recursos viverem em `resources/`.
