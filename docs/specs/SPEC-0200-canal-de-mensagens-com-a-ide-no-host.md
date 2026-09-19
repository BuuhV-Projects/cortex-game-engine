# 0200 - Canal de mensagens com a IDE no host nativo (M1 do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito

> **Implementação REMOVIDA da main** (ADR-0212): o preview nativo no Studio foi
> pausado e este código vive na branch `feature/preview-nativo-no-studio`.
> A spec fica como registro do que foi construído e de por que funcionava assim.

## Contexto

Hoje a IDE conversa com o jogo por `window.postMessage` (ADR-0056): o Studio põe
o jogo num `<iframe>` e troca mensagens JSON com a ponte do editor. No host
nativo esse transporte não existe — o Hermes não tem `postMessage`, e o host só
falava para fora por **stdout** (`console.*` vira `print`), sem nenhum caminho de
volta: não há stdin, socket, pipe nem IPC.

Este é o **M1 do PRD-0007**. O ativo que torna o marco barato: o conteúdo das
mensagens do editor **já é JSON serializável** — só o meio depende do browser.

## Decisão

Um canal de **linhas JSON** sobre o par stdin/stdout, com o mesmo contrato de
mensagens da ponte DOM (`hello`/`ack`/`state`/`select`/…).

### Host (`native/src/shims/ide_channel.{h,cpp}`)

- Uma **thread** lê o stdin linha a linha e empilha numa fila protegida por
  mutex. Ela **nunca toca em NAPI** — a regra de ouro do host (mesma do
  `io_pool`, M-perf-3): a thread só produz bytes.
- `drainIdeMessages` roda no `runFrame`, na thread JS, e entrega cada linha ao
  callback registrado. Uma linha malformada não derruba o host: a exceção é
  limpa e o loop segue.
- `__cortexIdeSend(linha)` escreve no stdout **prefixada** com `@cortex-ide@` e
  dá flush. O prefixo é o que deixa o canal conviver com os logs que já saem
  por ali (boot, `print` do JS, wgpu).
- A fila tem teto (`kMaxInbox`): enquanto o jogo carrega ninguém drena, e um
  produtor descontrolado não pode crescer sem limite.

### Gate: `CORTEX_IDE_CHANNEL=1`

Sem a variável, o shim não é registrado e a thread nem sobe — um jogo standalone
(stdin fechado) não paga nada, e não há risco de um `getline` em produção.

### Engine (`src/core/HostChannel.ts`)

`HostChannel` é o lado JS: `available`, `send(msg)`, `on(type, handler)`. O
**handshake é automático** — um `hello` da IDE é respondido com
`{ type: 'ack', protocol }` sem passar por handler nenhum, porque é o que prova
que os dois sentidos funcionam antes de qualquer outra mensagem.

O `Game` instancia o canal e, quando ele existe, responde a `requestState` com o
estado mínimo da cena (`{ type: 'state', scene, nodes: [{ id }] }`, lendo os nós
por `userData.cortexSceneNode`). É deliberadamente magro: o estado **rico** do
editor (outliner/inspector) chega no M3, quando a edição 3D rodar no host.

## Validação

`native/scripts/test-ide-channel.mjs` sobe o host de um export, fala só por
stdin/stdout — **sem Electron** — e verifica o contrato. Contra o export do
`teste4` numa fase:

```
ack recebido (protocolo 1)
state recebido: 78 nós, cena "game"
OK: canal bidirecional funcionando por stdin/stdout, sem Electron
```

O teste insiste no `hello` até o `ack` (o canal responde assim que o `Game`
existe) e depois pede `requestState` até vir com nós — o `ack` chega antes da
cena terminar de carregar, e é isso que a IDE veria na prática.

Unitários em `tests/core/HostChannel.test.ts`: handshake, roteamento por tipo,
tolerância a lixo no stdin e silêncio completo sem host.

## Consequências

- O M2 (janela nativa embutida no Studio) passa a ter como conversar com o host.
- O canal é **texto em stdout**: qualquer `print` do jogo que comece com
  `@cortex-ide@` seria confundido com mensagem. O prefixo é improvável o
  bastante para não valer um escape, mas fica registrado.
- Ordem é garantida (uma fila FIFO), entrega não: se o host morrer, as
  mensagens pendentes se perdem — quem fala precisa tolerar silêncio, como o
  teste faz ao repetir o `hello`.
- O `state` de hoje não serve para editar, só para provar o canal. Não construa
  UI em cima dele antes do M3.
