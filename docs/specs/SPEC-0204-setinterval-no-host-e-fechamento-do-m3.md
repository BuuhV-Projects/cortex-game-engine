# 0204 - `setInterval` no host nativo (e o fechamento do M3 do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito

## Contexto

A SPEC-0203 deixou um gap registrado: com o preview nativo, o outliner publicado
pelo host trazia **`Camera` e `(CameraHelper)`** em vez dos nós da fase. A
hipótese anotada era "ordem de boot — o `attachEditor` pega `game.scene` antes
da fase ser montada".

A hipótese estava errada, e a causa real é bem mais simples. Comparando o boot
**com** e **sem** o canal da IDE (mesmo export, mesma fase):

```
[sem canal] boot stage: fase:space-1   →  boot stage: pronto
[com canal] (nada)
```

Com o canal ligado o jogo **não chegava a carregar a fase**. O stdout completo
mostrou por quê:

```
ReferenceError: Property 'setInterval' doesn't exist
  at attachEditor  →  at Game
```

O host tinha `setTimeout`, `clearTimeout`, `setImmediate` — **não tinha
`setInterval`**. A ponte do editor usa `setInterval` para repetir o `hello` até
a IDE responder `ack`; sem o canal, a ponte ficava inerte e ninguém chamava. Com
o canal, a chamada acontecia, a exceção subia do construtor do `Game` e
derrubava o boot do jogo inteiro. O `hello` inicial ainda saía (é enviado antes
do `setInterval`), o que fazia o problema **parecer** um editor vendo a cena
errada.

## Decisão

`setInterval`/`clearInterval` no shim de timers (`native/src/shims/timers.cpp`),
no mesmo agendador dos outros:

- `Timer` ganha `intervalMs` (0 = dispara uma vez, > 0 = repete).
- **O reagendamento acontece ANTES do disparo.** Se o timer fosse reinserido
  depois, um `clearInterval` chamado de dentro do próprio callback não o
  encontraria na lista e o intervalo viraria imortal. Com o reagendamento antes,
  o `cancelTimer` acha e remove — e o disparo confere se o timer ainda está vivo
  antes de executar (pode ter sido cancelado por outro callback da mesma
  rodada).
- `fireTimer` **não** solta a `napi_ref` de um timer que repete: quem solta é o
  `clearInterval`. Soltar ali invalidaria a próxima disparada.
- Período mínimo de 1 ms (`kMinIntervalMs`), senão período zero viraria trabalho
  infinito no mesmo frame. O browser clampa em ~4 ms.

## Validação — e com isso o M3 fecha

`native/scripts/test-editor-bridge.mjs`, sem Electron, contra o export do
`teste4` com `--debug --editor`:

```
hello do editor recebido
state da fase: 67 itens no outliner
inspector do selecionado: "(HemisphereLight)" (6 secoes)
OK: selecao pelo canal reflete no estado publicado — sem Electron
```

Isto é o **aceite do M3** do PRD-0007: o editor roda no runtime nativo, publica
o estado da cena real pelo canal, e um `select` vindo da IDE muda o inspector
publicado. O teste espera o estado **da fase** de propósito — o primeiro `state`
sai antes de a cena montar, e aceitar aquele era o que mascarava o problema.

O `setInterval` em si é exercitado por esse mesmo caminho: sem ele, a ponte não
completa o handshake.

## Consequências

- Qualquer código de jogo ou de engine que use `setInterval` passa a funcionar
  no host. Antes era uma armadilha silenciosa: só quebrava quando a linha era
  de fato executada.
- Um `setInterval` sem `clearInterval` roda **para sempre** e mantém a função
  viva — no host não há aba para fechar. Vale a mesma disciplina do browser.
- O gap da SPEC-0203 está resolvido; aquela spec fica como registro de um
  diagnóstico que apontou para o lugar errado, corrigido aqui.
