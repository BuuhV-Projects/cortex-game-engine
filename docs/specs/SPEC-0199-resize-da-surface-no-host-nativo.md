# 0199 - Resize da surface no host nativo (M0 do PRD-0007)

**Data:** 2026-09-19
**Status:** aceito

## Contexto

O host nativo rodava em **tamanho fixo**: fullscreen por padrão e, em
`CORTEX_WINDOWED=1`, uma janela sem `SDL_WINDOW_RESIZABLE`. O motivo estava
documentado como armadilha conhecida: reconfigurar a surface do wgpu-native/D3D12
para um tamanho novo dá `Invalid surface` e derruba o processo — e o registro
dizia que **nem recriar a surface** resolvia.

Isso é o **M0 do PRD-0007** (preview nativo no Studio) e foi declarado **gate**:
um painel de IDE redimensiona o tempo todo, então sem resize não há preview
embutido, e o projeto inteiro pararia aqui.

## Decisão

O host **recria** a surface quando a janela muda de tamanho — e o *quando*
importa tanto quanto o *como*:

1. **`handleResize` não toca na surface.** Ele só atualiza `gpu->width/height` e
   marca `wantConfigure`. O evento SDL chega no meio do frame, possivelmente com
   uma textura de surface adquirida — mexer ali é o que crashava.
2. **A troca acontece no início do `acquireSurfaceTexture`**, antes de adquirir
   a textura do frame: é o único ponto do ciclo **sem textura de surface viva**.
   Detectando `width/height != configuredWidth/Height`, chama
   `core::recreateSurface`.
3. **`core::recreateSurface`** (`native/src/core/app_window.cpp`) cria uma
   surface nova a partir do HWND/HINSTANCE já guardados em `HostGpu`, faz
   `unconfigure` + `release` da antiga e zera `configuredWidth/Height` para
   forçar a configuração no tamanho novo. Se a criação falhar, mantém a antiga
   (imagem esticada é melhor que crash).
4. **`CORTEX_WINDOWED=1` passa a criar janela `SDL_WINDOW_RESIZABLE`.** Sem a
   flag, o SDL desfaz o redimensionamento e a janela volta sozinha ao tamanho
   anterior — foi o que fez o primeiro teste passar sem testar nada.

O lado JS não precisou de nada: `__cortexResize` já existia e já era chamado
pelo host a cada mudança (a canvas DOM-lite dispara `resize` e o engine
reconfigura o renderer).

## Por que a tentativa anterior falhou

O registro dizia "nem recriar a surface resolve". A diferença aqui não é *o que*
se faz, é *onde*: recriar no `handleResize` (dentro do processamento de eventos,
com o frame em andamento) continua quebrando. No início do frame, com nenhuma
textura adquirida, funciona.

## Validação

Script `native/scripts/test-resize.ps1`, contra o export do `teste4` numa fase
(`CORTEX_LAUNCH_QUERY="level=space-1"`):

| Critério | Resultado |
|---|---|
| 100 resizes seguidos (5 tamanhos, 0,35 s entre eles) | **sem crash** |
| `Invalid surface` no log | **nenhuma ocorrência** |
| VRAM (HUD) antes × depois | **975 MB → 975 MB** |
| FPS | 75 antes e depois |
| Imagem | correta no tamanho novo (screenshot em `.cortex/`) |

O teste **verifica o client rect a cada ciclo**: sem isso ele passa vazio se a
janela estiver minimizada ou não-redimensionável, que foi exatamente o que
aconteceu nas duas primeiras tentativas.

## Consequências

- O preview nativo do PRD-0007 deixa de estar bloqueado; o M1 (canal
  bidirecional) pode começar.
- Jogo em janela (`CORTEX_WINDOWED=1`) agora redimensiona. O **fullscreen
  continua de tamanho fixo** — nada muda no caminho de produção.
- **High-DPI (`HIGH_PIXEL_DENSITY`) continua desligado**: depende de re-config e
  não foi exercitado aqui. Ligar exige medir de novo.
- Cada resize destrói e recria uma surface. A 100 ciclos a VRAM ficou estável,
  mas arrastar a borda continuamente gera uma recriação por tamanho novo — se um
  dia isso pesar, o caminho é coalescer (só recriar quando o tamanho estabiliza
  por N frames).
