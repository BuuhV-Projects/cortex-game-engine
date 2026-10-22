# SPEC-0382 - `Audio` / `HTMLAudioElement` no host nativo

**Data:** 2026-10-22
**Status:** aceito
**Relacionados:** SPEC-0341 (voz nativa do webaudio-lite), ADR-0153 (liberar PCM decodificado), ADR-0100 (API fiel ao browser no native/)

## Contexto

O rádio do carro do DDD 61 (`audio/carRadio.ts`, desde o commit `ae66f1c` do jogo) toca uma faixa MP3 por
vez com `new Audio()`, para a música não entrar no pré-carregamento decodificado dos efeitos. O
`CarRadio` é criado no topo do `main.ts` do jogo. No browser e no Studio funciona; no export nativo o
host não define `Audio` e o boot morre com `ReferenceError: Property 'Audio' doesn't exist` antes do
primeiro quadro.

O host já tem o caminho de áudio inteiro: `fetch` lê o arquivo, `__cortexAudio.decode` (miniaudio:
wav/mp3/flac) decodifica e `__cortexAudio.play/stop/setGain` tocam a voz em stream SDL3. Falta só a
forma de elemento de mídia por cima disso.

## Decisão

Shim JS novo `native/js/src/shims/html-audio.js`, instalado no prelude, define `Audio` e
`HTMLAudioElement` (a mesma classe) com o subconjunto que o jogo usa, nomes e semântica do browser:

| Membro | Comportamento |
| --- | --- |
| `new Audio(url?)` | Elemento parado; `url` vira o `src`. |
| `src` (get/set), `getAttribute('src')`, `removeAttribute('src')` | Trocar ou remover o `src` para a voz, cancela um `play()` pendente, libera o PCM decodificado e deixa `paused = true`. `getAttribute` devolve `null` sem `src`. |
| `load()` | Reinicia o elemento (para a voz, libera o PCM). |
| `play()` | `Promise`. Busca com `fetch`, decodifica e toca. Sem `src` rejeita com `NotSupportedError`; decode falho dispara `error` e rejeita. Interrompido por `pause()`/troca de `src` antes de tocar, rejeita com `AbortError`. Já tocando, resolve sem nada novo. |
| `pause()` | Para a voz; `paused = true`. |
| `paused`, `ended` | Estado, como no browser. |
| `volume`, `muted` | Ganho da voz (`muted` → 0) aplicado ao vivo. |
| `loop` | Repete a faixa; sem `ended`. |
| `preload` | Aceito e guardado; o carregamento é sempre no `play()`. |
| `addEventListener/removeEventListener/dispatchEvent` | Eventos `ended` (fim da faixa, por tempo: duração decodificada) e `error`. |

O PCM é decodificado inteiro na memória (é o único caminho do host) e liberado com `__cortexAudio.free`
ao trocar de faixa, como o ADR-0153 faz com os buffers do WebAudio.

## Consequências

- O DDD 61 da main volta a passar do boot no export; o rádio toca as faixas MP3.
- Limites conhecidos (sem uso no jogo hoje): `play()` depois de `pause()` recomeça a faixa do início (a voz
  nativa não tem offset; adicionar um argumento de início ao `__cortexAudio.play` resolve); sem
  `currentTime`/`duration`/`playbackRate`/`canplay`; uma faixa de 3 min estéreo ocupa ~60 MB de PCM
  enquanto toca e o decode é síncrono no `play()` (streaming de verdade precisa de decode incremental no
  C++).
- Teste: `tests/native/html-audio.test.ts` com `__cortexAudio` e `fetch` falsos.
