# SPEC-0319 — `drawImage` do canvas 2D em C++: contrato do binding e medição

**Data:** 2026-10-07
**Status:** aceito
**Decisão:** ADR-0318

## Contexto

Rodada R1 do ciclo "75 fps no export nativo" do DDD 61: o radar (canvas 2D da UI
de runtime, ADR-0315) custava ~13 ms de `ui` por quadro no export. O ADR-0318
levou o laço do `drawImage` sem tinta pra C++; esta spec registra o contrato e
a medição.

## Comportamento

- `bitmap.js#drawBitmap` (sem tinta) monta os 19 parâmetros num `Float64Array`
  reaproveitado (`BLIT_*`: caixa de destino, inversa, retângulo fonte, limites
  da amostra, alfa) e chama `__cortexBlitImage(dst, dstW, src, srcW, params,
  clip|null, smooth)`.
- O host valida (buffers do tipo certo, caixa dentro do destino, limites dentro
  da fonte e inteiros, clip do tamanho do destino, parâmetros finitos) e devolve
  `true` se desenhou. `false` ou função ausente → o laço JS (`blitImage`) faz o
  mesmo desenho. Nunca há leitura/escrita fora do buffer.
- Pixel idêntico JS × C++: golden `native/tests/blit_golden.h` (8 casos:
  girado bilinear, com clip, com alfa, vizinho mais próximo, reduzido,
  translação, sub-retângulo da fonte, fonte opaca), conferido pelo vitest
  (`tests/native/blitGolden.test.ts`) e pelo `cortex_host_tests`
  (`native/tests/blit_test.cpp`). Uma mutação no arredondamento do C++ derruba
  7 dos 8 casos.

## Medição (export release, 1280×720, Setor O, 2 rodadas intercaladas cada)

Máquina com outros 3 exports de agentes rodando em paralelo — compare as
colunas entre si, não com a R0. `ui` = fatia da UI de runtime no quadro (ms).
Variantes: **base** = jogo 3e2323d + engine main; **jogo** = SPEC-0118 do DDD 61
(radar a 10 Hz de relógio e só quando muda); **C++** = esta mudança.

| cenário | variante | fps (mediana) | ui med | ui médio | ui p99 |
|---|---|---|---|---|---|
| parado | base | 12,4 / 14,9 | 15,3 / 14,7 | 16,8 / 15,6 | 23,3 / 21,7 |
| parado | só C++ | 17,0 / 19,9 | 4,1 / 3,7 | 4,5 / 4,1 | 7,5 / 6,7 |
| parado | só jogo | 18,6 / 20,0 | 1,6 / 1,4 | 1,9 / 1,7 | 5,1 / 4,0 |
| parado | jogo + C++ | 19,9 / 21,1 | 1,4 / 1,4 | 1,7 / 1,7 | 4,3 / 4,0 |
| andando | base | 17,2 / 17,0 | 13,9 / 14,1 | 14,4 / 14,6 | 19,7 / 20,3 |
| andando | só C++ | 20,1 / 20,7 | 3,6 / 3,4 | 4,0 / 3,8 | 7,1 / 6,5 |
| andando | só jogo | 18,9 / 18,5 | 1,4 / 1,4 | 4,1 / 3,9 | 17,1 / 19,9 |
| andando | jogo + C++ | 20,9 / 21,8 | 1,4 / 1,4 | 2,0 / 2,0 | 5,5 / 5,5 |

- Desenho do radar no nativo: ~12-13 ms → ~2 ms (≈ 6×), lido de "só C++"
  (redesenha todo quadro) menos o piso da UI (~1,6 ms com o radar parado).
- O `frameMs` p99 fica no teto de 100 ms em todas (máquina carregada); use o
  `ui p99` pra ver as travadas do radar.
- Mapa arrastando (394 ms por repintura na R0) não foi remedido nesta rodada; o
  mesmo laço domina lá, então a expectativa é a mesma ordem de ganho.

## Consequências

Ver ADR-0318.
