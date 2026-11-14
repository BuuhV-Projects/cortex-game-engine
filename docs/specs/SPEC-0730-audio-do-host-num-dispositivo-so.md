# SPEC-0730 - Áudio do host num dispositivo só

**Data:** 2026-11-13
**Status:** implementado

## Contexto

O Port Hollow travou no export nativo depois de muito tempo de jogo, num i7-3770K com RX 580. O crash handler do host
gravou uma exceção `0xC0000005` numa thread que não é a do JS. Resolvida com o `SDL3.pdb` da 3.4.12, a pilha é:

```
SDL_LockMutex_srw                 SDL_sysmutex.c:71
SDL_GetAudioStreamDataAdjustGain  SDL_audiocvt.c:1364
SDL_PlaybackAudioThreadIterate    SDL_audio.c:1266
PlaybackAudioThread               SDL_audio.c:1333
```

A thread de reprodução do SDL foi ler um `SDL_AudioStream` ligado ao dispositivo, e a memória dele já não era válida.

O host (`native/src/shims/audio.cpp`) cria cada voz com `SDL_OpenAudioDeviceStream(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK)`.
É o atalho do SDL para "um dispositivo com um stream": cada tiro, passo, motor, chuva ou fala **abre um dispositivo
lógico novo**, e o `SDL_DestroyAudioStream` dele **fecha esse dispositivo**. Quando nenhum som está tocando, fecha
também o dispositivo físico (WASAPI) e a thread de áudio. O som seguinte reabre o WASAPI e cria outra thread. Numa
sessão longa são milhares de aberturas e fechamentos, em paralelo com a thread de mistura e com a migração de
dispositivo que o SDL faz numa thread do WASAPI quando a saída padrão do Windows muda ou some. Esse é o caminho mais
delicado do SDL, e o crash caiu exatamente nele.

As releases da SDL depois da 3.4.12 (até a 3.4.20) não trazem correção de áudio no Windows.

### O vazamento: voz que nunca termina

O teste de estresse desta SPEC achou uma segunda causa, que pesa mais. O host recolhe a voz sem laço quando
`SDL_GetAudioStreamQueued` chega a 0. Mas, quando o stream reamostra, o reamostrador segura o fim da entrada até
alguém chamar `SDL_FlushAudioStream`. Isso acontece com o som tocado com tom diferente de 1 (`setPlaybackRate` dos
efeitos e dos motores) e com o som numa taxa diferente da do dispositivo (os áudios do Port Hollow são quase todos de
44,1 kHz, e a saída compartilhada do Windows costuma rodar a 48 kHz). Nesses casos a fila para em alguns bytes (56 no
teste) e nunca zera.

No teste, 800 das vozes de tom 1,25 ficaram presas para sempre. No jogo, praticamente todo tiro, passo, fala e efeito
deixava um stream vivo e, com o `SDL_OpenAudioDeviceStream`, **um dispositivo lógico aberto até o fim do processo**.
Depois de horas, são milhares: a thread de mistura percorre todos a cada ciclo, e a memória e os objetos do SDL só
crescem.

## Decisão

### Um dispositivo lógico, aberto uma vez

- `native/src/shims/audio_voices.{h,cpp}` (novo, sem NAPI) guarda os buffers decodificados e as vozes. O
  `audio.cpp` fica só com a ponte JS (`__cortexAudio`).
- O dispositivo lógico é aberto uma vez, no 1º `play`, com `SDL_OpenAudioDevice(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, nullptr)`,
  e só é fechado no `shutdownAudio`. Aberto no dispositivo padrão, ele continua acompanhando a saída do Windows quando
  ela muda.
- Cada voz é um `SDL_CreateAudioStream(formato do buffer, formato do dispositivo)`. O PCM entra antes de o stream ser
  ligado com `SDL_BindAudioStream`, para ele não começar vazio. O `SDL_DestroyAudioStream` desliga o stream sob o lock
  do dispositivo e não fecha nada.
- Ganho, tom, laço, offset de início (SPEC-0700), `stop`, `free` (ADR-0153) e o recolhimento das vozes que terminaram
  continuam iguais para o JS.
- Se o dispositivo não abrir (sem saída de áudio), o `play` devolve 0, como hoje, e tenta de novo no próximo.

### Flush no fim da entrada

- A voz sem laço recebe o PCM inteiro e logo um `SDL_FlushAudioStream`: a entrada acabou, e o reamostrador solta o
  fim. A fila zera quando o som termina de tocar, e o `update` recolhe a voz.
- A voz em laço continua sendo realimentada, sem flush.

### Diagnóstico

- Os eventos `SDL_EVENT_AUDIO_DEVICE_ADDED`, `SDL_EVENT_AUDIO_DEVICE_REMOVED` e `SDL_EVENT_AUDIO_DEVICE_FORMAT_CHANGED`
  vão para o log do host (`[audio] …`, com o id e o nome do dispositivo físico). O próximo crash de áudio vem com contexto.

### Teste

- `native/tests/audio_voices_test.cpp` (sem o flush, ele reprova com 800 vozes presas), com o driver `dummy` da SDL (`SDL_HINT_AUDIO_DRIVER`) e a thread de mistura
  rodando. São milhares de vozes que começam, param e terminam sozinhas, com laço, ganho, tom e `free` no meio. O
  teste confere que o dispositivo abre **uma vez**, que não sobra voz nem stream e que o `shutdown` fecha tudo.
- O alvo `cortex_host_tests` passa a linkar a SDL3.

## Consequências

- Some a abertura e o fechamento do WASAPI e da thread de áudio a cada som, e com eles a janela em que o crash aconteceu.
- O começo de cada som fica mais barato: não abre dispositivo.
- O dispositivo fica aberto o jogo todo, inclusive em silêncio. É o padrão de jogo, e o custo é uma thread de mistura
  parada, sem streams.
- O vazamento das vozes acaba: cada som é recolhido quando termina.
- Não há como reproduzir o crash original nesta máquina, que levou horas de jogo no i7. As duas causas prováveis
  saem: o acúmulo de vozes e dispositivos que nunca fechavam, e a abertura e o fechamento contínuos do dispositivo.
  O log dos eventos de dispositivo dá o contexto se ainda houver outra.
