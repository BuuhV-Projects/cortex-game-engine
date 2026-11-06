# SPEC-0700 — Áudio do host nativo: OGG, atenuação por distância, tom ao vivo e retomada da pausa

**Data:** 2026-11-06
**Status:** aceito

## Contexto

No export nativo do Port Hollow só se ouviam o tiro e o rádio (MP3). Quatro defeitos no áudio do host
(`native/src/shims/audio.cpp` + `native/js/src/shims/webaudio-lite.js` / `html-audio.js`):

1. **OGG Vorbis não decodifica.** O miniaudio decodifica WAV/MP3/FLAC sozinho; Vorbis exige o
   `stb_vorbis` incluído junto da implementação. Sem ele, `__cortexAudio.decode` volta `null` para todo
   `.ogg` (passos, portas, motor, falas, rádio da polícia) e o `decodeAudioData` rejeita.
2. **`PannerNode` não espacializa.** `PannerNode.setPosition` e `AudioListener.setPosition` eram no-op:
   todo `THREE.PositionalAudio` tocava no volume cheio a qualquer distância (os motores do trânsito e do
   avião berravam no mapa inteiro).
3. **`playbackRate` só no início.** `__cortexAudio.play` recebia a taxa ao nascer a voz; mudar
   `source.playbackRate` depois (tom do motor pela velocidade) não chegava ao host.
4. **Pausa reinicia a faixa.** A voz nativa não tinha offset de início: o `Audio` (rádio do carro) e o
   `THREE.Audio` recomeçavam do zero depois de `pause()`.

## Decisão

### Host (`audio.cpp` / `audio_decode.cpp`)

- O decode sai para `native/src/shims/audio_decode.{h,cpp}` (sem SDL nem N-API, testável). Inclui o
  `stb_vorbis.c` como o miniaudio pede: header (`STB_VORBIS_HEADER_ONLY`) antes do
  `MINIAUDIO_IMPLEMENTATION`, implementação depois. O `stb_vorbis.c` vem do `nothings/stb` no mesmo
  commit pinado do `stb_image` (`fetch-deps.ps1`, para `native/third_party/stb/`); a licença (MIT ou
  domínio público) está no fim do próprio arquivo.
- `__cortexAudio.play(bufferId, loop, gain, rate, offsetSeconds)`: o 5º argumento (padrão 0) é o ponto
  de início. A primeira alimentação começa no quadro `offset × sampleRate` (preso ao buffer; em loop,
  módulo a duração); as realimentações do loop seguem com o buffer inteiro.
- `__cortexAudio.setRate(voice, rate)` → `SDL_SetAudioStreamFrequencyRatio` (taxa ≤ 0 é ignorada).

### JS (`webaudio-lite.js`)

- **Distância.** `PannerNode.setPosition(x,y,z)` e `AudioListener.setPosition(x,y,z)` guardam a posição.
  O fator do panner segue a especificação do WebAudio, com `d` = distância panner↔ouvinte:
  - `inverse`: `ref / (ref + rolloff × (max(d, ref) − ref))`
  - `linear`: `1 − rolloff × (clamp(d, ref, max) − ref) / (max − ref)` (rolloff preso em [0, 1])
  - `exponential`: `(max(d, ref) / ref) ^ −rolloff`
  O fator entra no produto da cadeia (`chainGain`, SPEC-0607) como mais um elo. Mover o panner recompõe
  as vozes dele; mover o ouvinte recompõe as vozes de todos os panners com voz viva (o contexto guarda só
  esses, para não reter panner sem som). Só o caminho `setPosition` é implementado: sem
  `positionX`, o THREE 0.184 usa ele (`PositionalAudio`/`AudioListener.updateMatrixWorld`).
- **Tom ao vivo.** `playbackRate` é um `AudioParam` (`value`, `setValueAtTime`, `setTargetAtTime`,
  `linearRampToValueAtTime` — rampa aplica o valor final): mudar com voz viva chama `setRate` e reajusta
  o fim previsto da voz de disparo único.
- **Offset.** `BufferSourceNode.start(when, offset)` repassa `offset` ao `play` — com isso a pausa do
  `THREE.Audio` (que retoma com `start(…, _progress + offset)`) volta de onde parou.
- **`onended` assíncrono.** `BufferSourceNode.stop()` chamava `onended` na hora; o `THREE.Audio.pause()`
  faz `source.stop()` e só depois `source.onended = null`, então o `onEnded` do THREE zerava o
  `_progress` e a retomada recomeçava. Como no WebAudio, o `onended` agora roda numa microtask.

### JS (`html-audio.js`)

- `play()` toca a partir de `__position` e marca o instante de início; `pause()` guarda a posição tocada
  (`posição + tempo decorrido`, módulo a duração em loop) e para a voz; `play()` seguinte retoma dali.
- `currentTime` (get) devolve a posição atual; `currentTime = t` (set) muda a posição e, tocando, reinicia
  a voz em `t`. `ended` e fim por tempo zeram a posição. O timer de `ended` é programado com o
  **restante** (`duration − posição`).

## Consequências

- `.ogg` passa a tocar no export. Teste nativo: um `.ogg` mono 44,1 kHz de 0,5 s
  (`native/tests/fixtures/tone-mono-44k-500ms.ogg`) decodifica com 1 canal, 44 100 Hz e 0,5 s.
- Atenuação só por distância. **Pendência:** pan estéreo `equalpower`/HRTF — o `SDL_AudioStream` só tem
  ganho por voz; pan exigiria ganho por canal no mixer do host (pré-multiplicar no `feedVoice` não serve:
  o buffer inteiro é enfileirado de uma vez, então o pan não acompanharia o movimento). Cone
  (`coneInnerAngle`/`coneOuterGain`) e `setOrientation` também seguem ignorados.
- A posição do `Audio` é por relógio (`performance.now`), não pelas amostras consumidas no host: a
  latência do dispositivo (dezenas de ms) entra como erro na retomada — imperceptível no rádio.
- `detune`, `loopStart`/`loopEnd` continuam ignorados (pendência da SPEC-0607).
- Testes: `tests/native/webaudio-panner.test.ts` (distância nos três modelos, ouvinte móvel, tom ao vivo,
  offset), `tests/native/html-audio-resume.test.ts` (pausa/retomada, `currentTime`, `ended` com o
  restante) e `native/tests/audio_decode_test.cpp` (OGG).
