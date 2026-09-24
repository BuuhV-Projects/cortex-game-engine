# SPEC-0263 — Quadro de aquecimento do `Game.precompile`

**Data:** 2026-09-24
**Status:** aceito
**Decisão:** ADR-0262

## Contexto

Implementação do ADR-0262.

## Decisão

```ts
await game.precompile(); // pede um quadro de aquecimento e espera ele sair
```

- `precompile()` enfileira um pedido. No próximo `_tick`, antes de qualquer
  outro ramo de render (splash e cena em carregamento inclusive), o `Game`
  desenha o quadro de aquecimento e resolve todos os pedidos pendentes.
- Loop parado ou pausado: desenha na hora, dentro da chamada.
- `revealForWarmup(raiz)` (`src/core/WarmupFrame.ts`) força `visible` e
  `frustumCulled = false` na árvore inteira e devolve a função que restaura cada
  objeto ao estado anterior. O `Game` restaura num `finally`.
- Caminho do quadro: `setPostFX` registrado na cena do jogo → `postfx.render()`;
  senão `renderer.render(cena, câmera)`.
- Com o trace ativo, o evento `precompile` da SPEC-0261 continua sendo gravado
  (duração, consultas, nascimentos) — agora medindo o quadro.

## Consequências

- Teste: `tests/core/WarmupFrame.test.ts` (revela e restaura, inclusive estados
  mistos). O efeito real é medido pela volta a frio instrumentada do kart-racer:
  critério de pronto = nenhum pipeline acima de 5 ms nascendo na corrida.
