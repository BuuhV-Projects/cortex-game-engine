# 0010 - Painel Preview com Play/Stop e console de saída

**Data:** 2026-05-25
**Status:** aceito

## Contexto

A ADR-0005 (Electron como plataforma da UI) e a ADR-0008 (IPC via
contextBridge) listam `runProject` / `stopProject` / `onLog` /
`onProjectStopped` na API exposta, e o main process já implementa
`run:start` (spawna `vite` no projeto) e `run:stop`. O renderer já
reserva `#preview-container` e `#console-container`, mas o componente
`Preview.ts` está vazio — não há botão de Play, nem onde os logs vão.

Precisamos definir: (a) como o usuário inicia/para o projeto, (b) onde
o jogo executa visualmente, (c) como exibir logs (stdout/stderr do vite
+ erros do próprio jogo).

## Decisão

**Painel Preview** ocupa o quadrante direito superior da UI:

- **Toolbar** com indicador de status (parado / rodando / iniciando) +
  botão **Play** (vira **Stop** quando rodando). Sem projeto aberto, o
  botão fica desabilitado.
- **Área de visualização**: enquanto parado, mostra mensagem de
  placeholder ("Clique em Play para executar"). Quando rodando, embute
  um `<iframe>` apontando para o dev server do vite. O URL é detectado
  parseando a linha `Local: http://localhost:PORT/` que o vite imprime no
  stdout (em vez de fixar a porta — vite escolhe outra se 5173 está
  ocupada).

**Console** ocupa o quadrante direito inferior:

- Recebe linhas via `window.electronAPI.onLog(callback)`.
- Auto-scroll para o fim a cada nova linha.
- Botão "Limpar" no header para zerar o buffer.
- Diferencia stderr de stdout visualmente (cor vermelha para erro).
  *Limitação atual:* o handler `run:start` no main process redireciona
  ambos para o mesmo canal `log`. Versão futura pode separar via
  prefixo/canais distintos.

**Logs do jogo dentro do iframe** ficam para iteração futura — exigiria
um shim `postMessage` injetado no iframe para encaminhar
`console.log/error/warn` do contexto do jogo até o renderer. Em V1, o
usuário usa o DevTools do iframe (clique direito → Inspecionar) para
debug ao vivo do jogo.

**Origem do `projectDir`**: o `Preview` escuta o evento `project-open`
(já emitido por `FileTree` e `ProjectManager`) e guarda o path do projeto
ativo. Sem projeto, Play fica desabilitado.

## Consequências

- Fluxo "criar projeto → editar arquivo → ver rodando" fica completo
  sem o usuário precisar de terminal externo.
- A porta dinâmica (parseada do log) cobre conflito com outros serviços
  na máquina do usuário sem configuração.
- iframe permite hot reload do vite (mudanças em arquivos disparam
  reload automático no preview).
- Sem captura de `console.log` do jogo — limitação assumida em V1.
  Quando virar atrito, registrar novo ADR cobrindo o shim de postMessage.
- DevTools do iframe disponível via menu de contexto (comportamento
  padrão do Electron).
