# SPEC-0667 — Escala de render do host nativo por jogo (`renderScale` no cortex.json)

**Data:** 2026-11-02
**Status:** implementado

## Contexto

O host nativo renderiza num alvo offscreen de `janela × renderScale` e reduz para a swapchain no present
(SSAA, ADR-0103). O valor vinha cravado em 2.0 para todo jogo; só a variável `CORTEX_RENDER_SCALE` mudava,
e jogador nenhum define variável de ambiente.

O 2.0 nasceu para o contorno fino do teste4 (moedas com inverted-hull). Num jogo de mundo aberto ele custa
caro: no DDD 00 (RX 6600, 1080p, meio-dia, sol), a GPU leva 95 ms com 2.0 e 68 ms com 1.0. São quatro
vezes mais pixels sombreados por um serrilhado que a cena não tem.

## Decisão

O `cortex.json` do jogo aceita `"renderScale": <número>`. Precedência no boot do host:

1. `CORTEX_RENDER_SCALE` (diagnóstico e medição);
2. `renderScale` do `cortex.json`;
3. 2.0 (o comportamento de hoje, para quem não declara).

O valor passa pelo mesmo teto de antes (1.0 a 4.0). `CORTEX_RENDER_SCALE` vazia conta como ausente: antes ela virava 0 e caía no piso de 1.0, o que fez rodadas de medição saírem sem SSAA sem ninguém perceber. O export já copia campos desconhecidos do `cortex.json`
para o `cortex.json` do build, então nada muda no `export-game.mjs`.

## Como o Godot faz

`rendering/scaling_3d/scale` é configuração do projeto (padrão 1.0), com o modo de escala ao lado (bilinear,
FSR 1, FSR 2). Abaixo de 1.0 ele renderiza menor e sobe; supersampling não é o padrão de ninguém, é escolha
explícita do projeto. Aqui o projeto escolhe a escala no mesmo lugar onde declara nome e id; abaixo de 1.0 fica
para quando houver upscale melhor que o bilinear do blit.

## Consequências

- Jogos que não declaram nada continuam em 2.0: o teste4 e os outros não mudam.
- O DDD 00 passa a declarar `"renderScale": 1` (PR no repositório do jogo).
- Ainda não há opção no menu do jogo: a escala é do projeto, não do jogador.
