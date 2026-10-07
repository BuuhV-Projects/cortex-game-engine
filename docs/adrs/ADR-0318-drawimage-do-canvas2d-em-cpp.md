# ADR-0318 — Laço do `drawImage` do canvas 2D do host em C++ portátil (N-API)

**Data:** 2026-10-07
**Status:** aceito

## Contexto

O canvas 2D do host é um rasterizador em JS (ADR-0312). O ADR-0312 deixou
registrado: "mover pra C++ só com medição". A medição veio do DDD 61 no ciclo
"75 fps no export nativo" (rodada R0, SPEC-0317):

- radar (180×180, 4 ladrilhos girados + moldura): **~11,7 ms por desenho**; a
  fatia `ui` do quadro caía de 13,4 → 1,6 ms com o radar parado;
- mapa do menu arrastando: **~394 ms por repintura (2,3 fps)**.

O grosso é o `blitImage` (`bitmap.js`): para cada pixel de destino, volta pela
inversa, amostra bilinear e compõe `source-over`. No Hermes (sem JIT) isso dá
centenas de ns por pixel. O jogo pode redesenhar menos (SPEC-0118 do DDD 61), mas
o custo por desenho continua — e arrastar o mapa repinta a tela inteira.

## Alternativas

1. **Ficar em JS e otimizar mais o laço.** Já levou os atalhos óbvios (uint32,
   pixel transparente/opaco, clip em cache — SPEC-0317). O teto é o interpretador.
2. **Rasterizador inteiro em C++** (display list). Superfície N-API grande e
   reescrita do shim — desproporcional: só o blit é quente.
3. **Só o laço do blit em C++**, chamado por N-API com os mesmos argumentos que o
   JS já calcula (caixa de destino, inversa, retângulo fonte, limites, alfa,
   máscara de clip). O resto do contexto (estado, transform, caminhos, texto,
   tinta) continua em JS.

## Decisão

**Alternativa 3.**

- `native/src/canvas2d/blit.{h,cpp}`: `cortex2d::blitImage(...)` — C++17 puro,
  sem SO, sem Hermes/N-API (compila igual no PC e no GDK/Xbox). Tradução 1:1 do
  `blitImage` JS: mesma ordem das operações em `double`, sem contração em FMA,
  escrita de canal com a semântica do `Uint8ClampedArray` (arredonda ao par mais
  próximo, prende em 0..255, NaN → 0) e o `packOpaque` com `(v + 0,5) | 0`.
  Resultado: **pixel idêntico** ao JS.
- `native/src/shims/canvas_blit.{h,cpp}`: registra `__cortexBlitImage(dst, dstW,
  src, srcW, params: Float64Array, clip: Uint8Array|null, smooth)`. Valida
  tamanhos (caixa dentro do destino, limites dentro da fonte, clip do tamanho do
  destino) e lança `TypeError` em vez de ler/escrever fora do buffer.
- `bitmap.js`: o caminho sem tinta usa `__cortexBlitImage` quando existe; sem ele
  (Node/vitest, browser) roda o laço JS de sempre. Parâmetros num `Float64Array`
  reaproveitado (zero alocação por chamada).
- Paridade testada nos dois lados contra o mesmo "golden":
  `native/scripts/gen-blit-golden.mjs` roda o laço JS em casos fixos (rotação,
  escala, clip, alfa, pixels transparentes, nearest/bilinear) e grava
  `native/tests/blit_golden.h`; o vitest confere que o JS ainda bate com o
  arquivo e o `cortex_host_tests` confere que o C++ bate byte a byte.
- Medição antes/depois na SPEC-0319.

## Consequências

- O radar/mapa (e qualquer `drawImage` sem tinta) custa o laço nativo; o texto e
  as máscaras com tinta continuam no JS.
- Mudou o laço JS? Rode `node native/scripts/gen-blit-golden.mjs` e porte a
  mudança pro `blit.cpp` — o teste do C++ falha se os dois divergirem.
- Mais uma função global do host (`__cortexBlitImage`); sem ela (host antigo,
  Node) o JS cai no laço próprio sem quebrar nada.
