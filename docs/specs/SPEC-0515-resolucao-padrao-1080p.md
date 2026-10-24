# SPEC-0515 - Resolução padrão do export: 1920×1080

**Data:** 2026-10-24
**Status:** aceito

## Contexto

Decisão do usuário (2026-10-24): "O jogo por padrão vai rodar na resolução 1080p.
Depois disso eu penso em colocar em uma resolução maior, mas nada de rodar em resolução
menor por enquanto. Vamos focar em um tipo por agora e tratar outras como evolução
natural do game."

Antes desta spec, a janela do modo de desenvolvimento (`CORTEX_WINDOWED`, usada pelo kit
de medição e pelo dev-run) abria em 1280×720 (`native/src/main.cpp`), herança de antes
da SPEC-0455. O jogo em tela cheia já usava a resolução do monitor, que no PC do usuário
é 1920×1080.

## Comportamento

- **Host:** o tamanho padrão da janela de `CORTEX_WINDOWED` passa a ser **1920×1080**
  (`kDefaultWindowWidth`/`kDefaultWindowHeight` em `native/src/main.cpp`).
  `CORTEX_WINDOW_SIZE` continua sobrescrevendo, com os mesmos limites da SPEC-0455.
- **Tela cheia:** continua na resolução do monitor (sem mudança). No monitor 1080p do
  usuário, isso é 1920×1080.
- **Kit de medição (SPEC-0382):** a base é 1920×1080 (desde `4df8efab`). **720p sai das
  medições**, inclusive como dado secundário. `--window` fica só para a evolução futura
  para resoluções maiores.
- O supersampling (`CORTEX_RENDER_SCALE`, padrão 2,0) não muda: o alvo de desenho é
  3840×2160.

## Fora do escopo (backlog do PRD-0009)

- Forçar 1920×1080 em tela cheia num monitor de resolução diferente (modo exclusivo ou
  alvo fixo com escala). Só vale quando o jogo for rodar em monitor que não seja 1080p.
- Seletor de resolução / resoluções maiores: evolução do jogo, decisão futura do usuário.

## Consequências

- Dev-run e medições abrem do mesmo tamanho que o usuário joga.
- O critério do PRD-0466 (renderer nativo) é medido só em 1920×1080.
