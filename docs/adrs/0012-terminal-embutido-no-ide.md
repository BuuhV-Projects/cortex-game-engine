# 0012 - Terminal embutido no IDE

**Data:** 2026-05-25
**Status:** aceito

## Contexto

O SPEC-0010 cobriu o painel de console que mostra a saída do `run:start`
(vite no projeto). Mas pra instalar dependências (`yarn add three`),
rodar scripts (`yarn build`) ou qualquer outro comando contra o projeto,
o usuário precisa abrir um terminal externo, navegar até o projeto e
rodar manualmente — quebra do fluxo dentro do IDE.

Há duas direções para um "terminal" no IDE:

1. **Terminal interativo real** com `xterm.js` + spawn de shell PTY
   (`node-pty`). Suporta stdin, cores ANSI, comandos interativos
   (prompts de `npm init`, etc.). Pesado: requer dep nativa (`node-pty`)
   que precisa de rebuild para a versão do Electron, manuseio de
   resize, escape sequences.
2. **Comando one-shot** com input simples + output streaming. Sem
   stdin interativo, sem cores ANSI. Cobre 90% dos casos práticos
   (instalar libs, rodar scripts) com fração da complexidade.

Para V1, a complexidade do (1) supera o ganho — começamos com (2) e
revisitamos quando virar atrito real.

## Decisão

**Handler IPC** `terminal:run(projectDir, command)` no main process:
- Spawna o `command` com `shell: true` e `cwd: projectDir`.
- Redireciona stdout/stderr para o canal `terminal:output` (separado de
  `log` para não misturar com a saída do vite do Play).
- Notifica conclusão via canal `terminal:done` com o exit code.
- Mantém referência do processo em variável separada de `runningProcess`
  (do `run:start`), permitindo rodar terminal e play simultaneamente.
- `terminal:stop` mata o processo do terminal sem afetar o play.

**UI**: painel inferior ganha **abas** ("Console" / "Terminal"):
- **Console**: comportamento atual (SPEC-0010) — logs do `run:start`.
- **Terminal**: input de comando + botão "Executar" (ou Enter) + área
  de output streaming. Botão "Parar" aparece enquanto há comando em
  execução.

**Sem stdin interativo**: prompts em comandos (ex.: `npm init`) ficam
travados. Workaround V1: usar flags não-interativas (`yarn install --yes`).
Iteração futura traz xterm.js + node-pty quando justificar.

**Sem cores ANSI no V1**: o output é texto bruto. Cores podem ser
processadas via `ansi-to-html` num passe futuro.

## Consequências

- Fluxo "criar projeto → `yarn install` → Play" fica dentro do IDE.
- Independência de processos: Play (vite) e terminal coexistem.
- Limitação assumida: comandos interativos não funcionam sem stdin.
  Documentar no tooltip do input ou no placeholder ("comandos
  interativos não são suportados").
- O painel inferior cresce em complexidade (tabs) — pavimenta para
  futuros painéis (ex.: "Problems", "Debug").
