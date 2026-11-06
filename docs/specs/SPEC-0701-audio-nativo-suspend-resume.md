# SPEC-0701 — Áudio do host nativo: `suspend()` e `resume()` do contexto

**Data:** 2026-11-06
**Status:** implementado
**Base:** SPEC-0700 (áudio nativo: OGG, distância, tom ao vivo e retomada), SPEC-0607 (ganho pela cadeia)

## Contexto

No navegador, `AudioContext.suspend()` congela todo o grafo do WebAudio de uma vez, e `resume()` o religa. O
jogo usa isso como **ponto único** para calar os sons do mundo no menu de pausa: motor, pneus, trânsito, avião e
chuva, todos `THREE.Audio`/`PositionalAudio` no mesmo contexto. No export nativo o `AudioContextLite`
(`native/js/src/shims/webaudio-lite.js`) devolvia `Promise.resolve()` nos dois e não fazia nada, então os loops
continuavam tocando com o menu aberto.

O host (`__cortexAudio`) não tem pausa global, só `play/stop/setGain/setRate/decode/free` por voz.

## Decisão

Implementar o `suspend/resume` no shim JS, sobre o ganho por voz que o host já tem (sem mudar o C++):

- O contexto guarda as fontes com voz viva (`__voiced`: entra no `__startVoice`, sai no `stop`).
- O ganho que vai ao host passa por `voiceGain(source)`: **0 com o contexto suspenso**, senão o produto da cadeia
  (SPEC-0607, com o fator de distância da SPEC-0700).
- `suspend()`: `state = 'suspended'` e `setGain(voz, 0)` em toda voz viva (a one-shot que já acabou pelo
  `__endsAt` sai do conjunto sem chamada).
- `resume()`: `state = 'running'` e cada voz viva recebe de novo o ganho da sua cadeia.
- Com o contexto suspenso, uma voz que nasce (`play()`) nasce muda, e `setVolume`, a posição do panner ou do
  ouvinte recalculam o ganho mas mandam 0. Tudo volta no `resume()`.
- Os dois devolvem `Promise` resolvida, como no WebAudio.

## Limitação conhecida

É **mudo**, não congelado: a voz nativa segue andando calada (o host não pausa voz) e o `currentTime` continua
correndo. Um loop volta num ponto adiante, o que não se nota em motor nem chuva. Uma one-shot que acaba durante a
suspensão termina calada. Pausa de verdade por voz no host fica para quando algum jogo precisar.

## Testes

`tests/native/webaudio-suspend.test.ts`, com o `__cortexAudio` simulado:

- `suspend()` manda ganho 0 a todo loop vivo e põe `state = 'suspended'`; `resume()` devolve o ganho de cada um
  (inclusive o `setVolume` feito durante a suspensão) e `state = 'running'`.
- Som que nasce com o contexto suspenso nasce mudo e ganha volume no `resume()`.
- Voz parada (`stop`) não recebe ganho no `resume()`.
