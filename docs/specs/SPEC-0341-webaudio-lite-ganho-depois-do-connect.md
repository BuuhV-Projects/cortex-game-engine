# SPEC-0341 - webaudio-lite: a voz nasce no `connect`, não no `start`

**Data:** 2026-10-09
**Status:** aceito

## Contexto

Relato do usuário no export nativo do DDD 61: "ao abrir o jogo está tocando som
de freio de carro em loop". No navegador não acontece.

O jogo cria no carregamento o loop do pneu cantando (`tires-squealing.mp3`)
com volume 0 e o deixa tocando; o volume sobe só em derrapagem/freada forte
(`audio/gameAudio.ts`, `main.ts` → `skidAmount`).

O `THREE.Audio.play()` (three 0.184) faz, nesta ordem:

```js
source.start(...);     // 1
...
return this.connect(); // 2 — source.connect(gain)
```

O shim `native/js/src/shims/webaudio-lite.js` decidia o ganho e registrava a
voz nos `GainNode` da cadeia **dentro de `start()`**, seguindo `source.__next`.
No passo 1 a fonte ainda não está ligada a nada: o ganho calculado era 1 e a
voz não entrava em nenhum `GainNode`. Resultado: **todo** `THREE.Audio` do
export tocava a volume cheio e ignorava `setVolume` (inclusive mudo/menu). O
loop do pneu, nascido com volume 0, tocava alto para sempre — o "freio em
loop". A chuva e os motores do trânsito sofrem o mesmo.

## Decisão

Seguir a semântica do WebAudio: fonte não ligada é inaudível. `start()` só
marca a fonte como iniciada; a voz nativa nasce no primeiro momento em que a
fonte está iniciada E ligada (o `connect` logo depois, no caminho do `three`;
ou o próprio `start`, se quem usa ligou antes). Aí o ganho da cadeia já é o
real e a voz entra nos `GainNode`, então `setVolume` ao vivo funciona.

`stop()` antes de a voz nascer cancela o início (nada toca).

## Consequências

- Volume inicial e `setVolume` respeitados no export, como no navegador.
- Um teste com `THREE.Audio` + `AudioListener` reais sobre o shim trava a ordem
  `start` → `connect` (`tests/native/webaudio-gain.test.ts`).
- Só JS do prelude: entra no `boot.hbc` do export; o host não recompila.
- Fora do escopo (já existiam, anotados): o `playbackRate` ao vivo não chega ao
  host (só o inicial), e as vozes encerradas não saem da lista `__voices` dos
  `GainNode`.
