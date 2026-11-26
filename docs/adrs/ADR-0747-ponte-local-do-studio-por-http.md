# ADR 0747 - Ponte local do Studio por HTTP em 127.0.0.1 com token

**Data:** 2026-11-25
**Status:** aceito

## Contexto

O ajuste da pegada da arma no painel "Auto-rig de personagem" só se faz pelo mouse (arrastar o gizmo, Shift para
fino). Uma sessão do Claude Code que tenta pelo computer-use não consegue o arrasto fino, e o usuário quer que outra
sessão mude a pegada, veja a foto, meça e grave só pelo MCP `cortex` (SPEC-0746). O MCP `cortex` roda num processo
próprio (stdio, ADR-0736), fora do Studio: precisa de um canal até o painel aberto.

## Decisão

Um servidor HTTP no main process do Electron, escutando **só em `127.0.0.1`**, numa porta livre escolhida pelo sistema.
Ao subir, o Studio grava `~/.cortex-studio/rig-bridge.json` com `{ port, token, pid }`; ao sair, apaga. Cada pedido é
`POST /rig` com o corpo `{ cmd, args }` e o cabeçalho `x-cortex-token`; sem o token certo, 403. O main repassa o
comando ao renderer pelo IPC (`rigRemote:command`) e devolve a resposta (`rigRemote:reply`).

Alternativas pesadas:

- **Chrome DevTools Protocol** (`--remote-debugging-port`): dá controle total do renderer, mas abre o Studio inteiro
  a qualquer processo local, obriga a subir o Studio com a flag e o MCP teria de falar CDP e conhecer o DOM.
- **Pipe nomeado / socket Unix**: sem porta, mas o código muda por sistema (Windows × POSIX) e o `fetch` do Node não
  fala com eles; o ganho de segurança sobre o token é pequeno numa máquina de dev.
- **Arquivo de comandos vigiado**: sem servidor, mas com latência de polling, sem resposta síncrona (a foto e a medida
  precisam voltar) e com corrida entre escrita e leitura.
- **Porta fixa sem token**: simples, mas qualquer página aberta num navegador pode mandar `POST` para `127.0.0.1`; o
  cabeçalho próprio e o token fecham isso (o navegador exige preflight, que a ponte não responde).

## Consequências

- O MCP acha a ponte pelo arquivo (ou por `CORTEX_RIG_BRIDGE_FILE`); sem arquivo ou sem resposta, a ferramenta diz
  que o Studio não está aberto.
- Só o painel de auto-rig responde; com a aba fechada, a ponte devolve o erro do painel. A ponte não expõe leitura
  nem escrita de arquivo genérica: só os comandos do painel.
- O token fica só nesse arquivo, no perfil do usuário; é renovado a cada abertura do Studio.
