# SPEC-0455 — Medir o export em Full HD (tamanho de janela por variável)

**Data:** 2026-10-24
**Status:** implementado e medido (`e93dd9ae`)

## Contexto

O usuário joga em Full HD (1920×1080). Todas as rodadas do kit (SPEC-0382) usam a
janela do modo de desenvolvimento, fixa em 1280×720 (`native/src/main.cpp`), e o
export faz supersampling 2× (`CORTEX_RENDER_SCALE`, padrão 2,0): o passe
principal desenha em 2560×1440. Em Full HD isso vira 3840×2160 — quase 4K —, e o
custo de GPU (inclusive o da sombra, que é desenho) pode estar subestimado nas
medições. Backlog de prioridade alta do PRD-0009.

## Comportamento

- **Host:** `CORTEX_WINDOW_SIZE=<largura>x<altura>` (ex.: `1920x1080`) define o
  tamanho da janela do modo `CORTEX_WINDOWED`. Ausente, mal formado ou fora dos
  limites (320×200 a 7680×4320) → o padrão 1280×720. O parser é puro
  (`native/src/core/window_size.h`, testado em `cortex_host_tests`). Em
  fullscreen nada muda (resolução do display).
- **Kit:** `round.sh`/`ab.sh` ganham `--window <WxH>`, que exporta
  `CORTEX_WINDOW_SIZE` para a rodada e fica registrado no `meta.txt`.
- **Fator efetivo de supersampling** registrado por resolução: o alvo de desenho
  é `janela × CORTEX_RENDER_SCALE` (1280×720 → 2560×1440; 1920×1080 → 3840×2160).

## Medição pedida

Pelo menos um par andando (autopiloto) em 1920×1080 contra 1280×720, com o
tempo de GPU do kit (`CORTEX_FRAME_TIMING`, SPEC-0254), para dizer se a GPU passa
a ser o gargalo em Full HD; e o par sombra ligada × `?sombra=0` também em Full HD.

## Resultado (2026-10-24, walk, Comercial, intercalado, 2 réplicas, 4/4 válidas)

| janela | alvo de desenho (× 2,0) | render (CPU) | GPU por quadro (`gpu-work` med) |
| --- | --- | --- | --- |
| 1280×720 | 2560×1440 | 12,41 / 12,33 ms | ~0,6–0,8 ms |
| 1920×1080 | 3840×2160 | 12,32 / 12,25 ms | ~0,9–1,3 ms |

A GPU cresce ~1,6× com o supersampling quase 4K, mas fica em ~1,3 ms num quadro
de ~25 ms: **em Full HD a GPU não é o gargalo** nesta máquina (GPU de 8 GB); o
custo segue sendo CPU do render. As medições em 1280×720 continuam representando
o CPU; para GPU, usar `--window 1920x1080`.
