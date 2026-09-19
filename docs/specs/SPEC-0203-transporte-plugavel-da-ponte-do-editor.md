# 0203 - Transporte plugável da ponte do editor (M3b do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito — **parcial**, ver "O que ainda não funciona"

> **Implementação REMOVIDA da main** (ADR-0212): o preview nativo no Studio foi
> pausado e este código vive na branch `feature/preview-nativo-no-studio`.
> A spec fica como registro do que foi construído e de por que funcionava assim.

## Contexto

A ponte do editor (ADR-0056) entrega o estado para os painéis do Studio por
`window.parent.postMessage` e recebe comandos pelo evento `message`. Com o
editor rodando no host nativo (SPEC-0202), esse transporte não existe: o Hermes
não tem `postMessage`, e a conversa passa pelo canal de linhas JSON (SPEC-0200).

O levantamento do PRD-0007 já apontava por que isso seria barato: **o conteúdo
da ponte sempre foi JSON serializável** — só o meio dependia do browser.

## Decisão

### Transporte extraído (`src/editor/bridgeTransport.ts`)

`BridgeTransport` = `send` + `onMessage` + `dispose`, com duas implementações:

- **iframe** — `window.parent.postMessage`, o caminho histórico;
- **host** — o `HostChannel` (SPEC-0200).

`detectBridgeTransport()` escolhe: host primeiro (preview nativo), iframe
depois, `null` quando não há IDE — e aí a ponte fica inerte, como sempre.

A `EditorBridge` perdeu as três amarras com o DOM (`inIframe`,
`window.parent.postMessage`, `addEventListener('message')`) e passou a falar só
com o transporte. **Nenhuma mensagem mudou de formato.**

O canal do host roteia **por tipo** (diferente do `message` do browser, que é um
fluxo único), então o transporte registra um handler por tipo — a lista
`IDE_MESSAGE_TYPES` precisa acompanhar os `case` da ponte.

### Canal compartilhado (`getHostChannel()`)

O shim do host guarda **um único** callback de recebimento. Com o `Game` e a
ponte criando cada um o seu `HostChannel`, o segundo a registrar roubava as
mensagens do primeiro: o `hello` do editor saía, o `ack` chegava no canal errado
e o estado nunca era publicado. Agora há uma instância compartilhada.

### Lado Studio

`EditorPanels.handleNativeMessage()` recebe as mensagens do canal e cai no mesmo
`renderState` do iframe; `send()` escolhe o destino (`postMessage` ou IPC do
preview nativo). Os painéis não sabem a diferença.

## Validação

`native/scripts/test-editor-bridge.mjs` faz o papel da IDE, sem Electron:

```
hello do editor recebido
state recebido: 2 itens no outliner, editorActive=true
itens publicados: Camera, (CameraHelper)
OK: handshake e publicacao de estado pelo canal do host, sem Electron
```

Mais 6 unitários em `tests/editor/bridgeTransport.test.ts` (escolha do meio, o
host vencendo o iframe, cobertura de todos os `IDE_MESSAGE_TYPES`, marca de
origem).

## O que ainda NÃO funciona — **RESOLVIDO na SPEC-0204**

> A causa não era a ordem de boot, como a hipótese abaixo supunha: o host não
> tinha `setInterval`, a ponte usa isso para repetir o `hello`, e a exceção
> derrubava o boot do jogo antes da fase montar. Com o timer implementado, o
> outliner publica os 67 nós da fase e o `select` pelo canal reflete no
> inspector. O texto original fica abaixo como registro do diagnóstico.

### Diagnóstico original (apontava para o lugar errado)

**O outliner publicado no host traz `Camera` e `(CameraHelper)` — não os nós da
fase.** O transporte está provado (handshake e estado trafegam pelo canal), mas
o editor não está enxergando a cena do jogo no runtime nativo: os `editRoots`
não apontam para a cena montada pelo `buildScene`. Para comparação, o
`requestState` do `Game` (SPEC-0200) enxerga 78 nós na mesma fase.

Por isso o teste de aceite **não exercita `select`**: com o outliner sem os nós
da cena, um verde ali seria enganoso. O aceite completo do M3 — selecionar no
preview nativo e ver o Inspector da IDE refletir — depende de resolver isso.

Hipótese a investigar: o `attachEditor` captura os roots na construção do
`Game`, e no host a cena da fase é montada depois (e o `teste4` ainda troca de
cena entre menu e fase). No browser o mesmo código funciona, então a diferença
deve estar na ORDEM de boot do host.

## Consequências

- O editor deixa de depender de iframe para conversar com a IDE — o que era o
  bloqueio estrutural do M3.
- Quem adicionar um `case` novo no `onMessage` da ponte precisa adicionar o tipo
  em `IDE_MESSAGE_TYPES`, senão ele funciona no iframe e silenciosamente **não**
  funciona no host.
- Só pode existir um consumidor do canal por processo (`getHostChannel`). Se um
  dia houver mais, o shim precisa suportar vários callbacks.
