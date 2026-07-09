# 0109 - Splash obrigatória da engine no host nativo

**Data:** 2026-07-09
**Status:** aceito

## Contexto

Jogos exportados pela engine não davam nenhum sinal de terem sido feitos nela.
Queremos uma assinatura visual — a marca **TS Cortex Studio** — exibida no início
de todo jogo exportado, como fazem Unity/Unreal/Godot.

Dois requisitos moldaram a solução:

1. **Obrigatória de verdade.** Se a splash fosse um arquivo solto ao lado do exe
   (ou a primeira cena do bootstrap JS), o dev a removeria em um minuto.
2. **Não pode custar tempo de tela.** O jogo já demora a subir (bundle + pak +
   cena); a splash deve *cobrir* essa espera, não somar a ela.

A restrição técnica que decidiu o desenho: **o adapter/device do WebGPU são
adquiridos pelo JS**, via `navigator.gpu` (ver `core/host_gpu.h`). Quando a
janela SDL sobe, o host ainda não tem `WGPUDevice` — logo, é impossível desenhar
a splash "antes do JS bootar", como seria natural supor.

## Decisão

A splash vive no **host, em C++** (`native/src/webgpu/splash.cpp`), e o PNG da
marca é **embutido no binário** como array de bytes
(`native/src/brand/splash_png.h`, gerado por `native/scripts/gen-brand.mjs` a
partir de `brand/ts-cortex-studio.svg`). Não há arquivo para apagar.

Como o device só existe depois que o JS o pede, `splashFrame()` é chamada **todo
frame do loop do host** e:

- retorna `false` enquanto não há `device`/`queue` (nada a fazer);
- no primeiro frame com device, marca `t0` e passa a desenhar;
- desenha por ~1,9 s: fade-in 350 ms → hold 1100 ms → fade-out 450 ms;
- libera os recursos e retorna `false` para sempre ao terminar.

Ela roda **depois** de `webgpu::presentIfAcquired()` e **apresenta um frame
próprio**: adquire a própria textura de swapchain e faz `wgpuSurfacePresent`. Com
isso não disputa a `currentTexture` que o JS possa ter adquirido no mesmo frame —
o custo é um present extra durante ~1,9 s, irrelevante.

O desenho é um triângulo fullscreen: limpa com o `bg-deep` do tema
(`#0d0e14`) e compõe a marca centrada, preservando o aspecto, com
`mix(BG, logo.rgb, logo.a * alpha)`. O blend é feito **em gama** — mesmo critério
do ADR-0105 — porque a arte foi autorada em sRGB e a swapchain é `BGRA8Unorm`.

Enquanto a splash está no ar, o jogo carrega por baixo: é exatamente o tempo
morto que queríamos cobrir.

### Escape hatch do dev

`CORTEX_NO_SPLASH=1` pula a splash **apenas quando o host roda apontando para a
pasta do jogo** (`cortex_host.exe D:\jogos\teste4`), o que só acontece em
desenvolvimento — o export nunca passa `argv[1]`. No jogo exportado a variável é
ignorada.

## Consequências

- **Quem exporta um jogo carrega a marca.** Sem arquivo removível, sem opção no
  `cortex.json`. Mexer nisso exige recompilar o host.
- A splash **não aparece nos primeiros instantes** da janela (entre a criação da
  janela e o device vindo do JS a tela fica preta). É curto, mas existe; eliminar
  exigiria o host adquirir um device próprio, o que conflitaria com a
  configuração da surface feita pelo JS.
- Se o decode do PNG ou a criação do pipeline falharem, a splash **desliga-se
  sozinha** (`g_failed`) e o jogo segue. Ela nunca é motivo de crash.
- O PNG embutido custa ~45 KB no binário e ~9,4 MB de VRAM transitória
  (2800×840 RGBA), liberados ao fim da splash.
- `webgpu::acquireSurfaceTexture` deixou o namespace anônimo de `surface.cpp` e
  passou a ser declarada em `internal.h` — a splash precisa apresentar sozinha.

## Alternativas descartadas

- **Splash no bootstrap JS da engine.** Muito mais barata e funcionaria também no
  browser, mas o dev a removeria editando a engine vendorizada. "Obrigatória" só
  por convenção não é obrigatória.
- **Host cria o próprio device antes do JS.** Permitiria desenhar a splash já no
  primeiro frame, mas dois devices sobre a mesma surface levam a conflito de
  configuração no wgpu-native/D3D12.
