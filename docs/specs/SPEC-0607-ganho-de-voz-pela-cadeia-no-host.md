# SPEC-0607 — Ganho de cada voz pela cadeia inteira no áudio do host nativo

**Data:** 2026-10-26
**Status:** aceito

## Contexto

O áudio do export nativo é o `webaudio-lite.js` (`native/js/src/shims/`): a forma do WebAudio que o
`THREE.Audio` usa, sobre `__cortexAudio` (uma voz nativa por fonte, com ganho e pitch; `audio.cpp`).
O grafo é uma cadeia: fonte → ganho do som (`THREE.Audio.gain`) → [panner] → ganho do ouvinte
(mestre, `AudioListener.gain`) → destino. A voz nativa recebe o produto dos ganhos.

**Defeito (SPEC-0201 do jogo DDD 61).** A voz é registrada em todos os `GainNode` da cadeia, mas
quando um deles muda, `GainNode.__updateVoices` aplica `chainGain(this)`: o produto **desse nó para
baixo**. Mudar o mestre dá a toda voz só o ganho do mestre e apaga o volume próprio do som. Sintoma no
export: o loop do pneu em volume 0 vai a 1 ao desmutar; chuva parada em 0 e motor do trânsito vão ao
volume cheio. Desde a SPEC-0192 do jogo (todo boot muta e desmuta o mestre no fim), acontece em todo
export. No navegador não acontece.

Também: a lista `__voices` de cada nó nunca é limpa. Voz parada ou terminada continua recebendo
`setGain` (o host ignora o id morto) e a lista cresce sem limite.

## Como o Godot faz (4.7.2, `ed1daf0`)

- O volume do player é dele: `AudioStreamPlayer::_get_volume_vector()`
  (`scene/audio/audio_stream_player.cpp:183-193`) converte `volume_db` em linear e o entrega ao
  `AudioServer` junto com o bus (`start_playback_stream`, linha 114). Mudar o volume do player só troca
  esse vetor (`set_volume_db`, linhas 71-75).
- O volume do bus é aplicado na mistura do bus, em cima do que os players já somaram
  (`servers/audio/audio_server.cpp:624`, `db_to_linear(bus->volume_db)`, e `mute` zera na 628-634). Cada
  bus manda para o seu `send` até o Master (linhas 600-611).
- Ou seja: o ganho final de um som é **a composição da cadeia**, calculada na mistura; mudar um elo
  (player, bus, Master) nunca sobrescreve outro.

**Comparação e aplicabilidade.** O host não mistura em JS: cada voz é um stream SDL com **um** ganho.
Não há bus para aplicar o ganho do mestre depois. O equivalente é a voz guardar a sua cadeia e
recompor o produto inteiro sempre que um elo muda, que é o que o navegador faz (o WebAudio multiplica
ao longo do grafo). Custo: só em mudança de ganho (evento, não por quadro), percorrendo as vozes vivas
do nó e a cadeia de cada uma (≤ 8 nós).

## Decisão

1. **Ganho pela cadeia inteira.** O `GainNode` passa a registrar as **fontes** com voz viva (não ids de
   voz). Quando o ganho de um nó muda, cada fonte registrada recebe `chainGain(source.__next)`: o
   produto desde o 1º nó depois da fonte até o destino (ganho do som × nós intermediários × mestre).
   Um som curto que começa com o mestre mudo nasce com ganho 0 e, ao desmutar, recebe o ganho
   próprio × mestre.
2. **Limpeza das listas.** `stop()` tira a fonte de todos os nós da cadeia em que ela foi registrada. A
   voz que termina sozinha (não-loop) não avisa o JS. A fonte guarda o instante previsto de fim
   (`currentTime + duration / playbackRate`), e o nó a descarta quando passa por ela depois disso.
3. **`loopStart`/`loopEnd` e começar no meio (`start(when, offset)`): pendência.** Exigem mudar o `play`
   e o `feedVoice` do `audio.cpp` (realimentar só o trecho do loop), recompilar o host e validar a
   reprodução no export, o que não dá para conferir sem ouvir. O jogo segue com o WAV pré-cortado.

## Consequências

- Corrige o volume de todo som do export depois de qualquer mudança do mestre (boot do DDD 61, menus,
  pausa). Só o lado JS mudou: vale depois de um export novo, sem recompilar o host.
- **O jogo pode tirar o contorno da SPEC-0201** (o `GameAudio` reaplicar `setVolume(getVolume())` nas
  vozes vivas ao religar o mestre) depois de re-vendorizar a engine com esta correção.
- Fim de som por tempo é aproximado (sem evento do host). Basta para limpar a lista; o `onended` de
  voz que termina sozinha continua sem disparar (como antes).
- Teste: `tests/native/webaudio-gain.test.ts` (shim real com `__cortexAudio` falso) reproduz o defeito
  (loop em volume 0 → mestre 0 → mestre 1 ficava em 1) e a limpeza das listas.
