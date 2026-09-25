# ADR-0278 - Teto do heap do Hermes sobe para 1 GB

**Data:** 2026-09-25
**Status:** aceito (substitui o valor do teto do ADR-0153; o motivo de TER teto continua)

## Contexto
O ADR-0153 pôs `GCConfig.maxHeapSize = 512 MB` no host: sem teto o Hades cresce o heap em
vez de coletar. O crash-bandicoot-racer passou a morrer na CARGA do export com
`HermesGC: OOM ... external = 553 MB`. Medido com três exports:

| export | resultado |
|---|---|
| jogo como está | OOM aos ~9 s, external 550 MB |
| sem colisão na decoração | OOM igual, external 553 MB |
| `mergeStatic: false` | carrega; ~13 fps (build `--debug`), ~1.900 draws, ~4 M tris |

O pico é a fusão estática (SPEC-0120): os GLBs cozidos são interleaved, o
`flatSource` de-interleava uma cópia inteira de cada fonte e a guarda num `WeakMap`
preso à fonte (que o cache de GLB mantém viva). No pico convivem GLB original + cópia
plana + malha fundida. Quem estoura é a memória EXTERNA (ArrayBuffers), não os objetos JS
(heap 25 MB).

Alternativas: (1) fusão sem a cópia plana (bake direto do interleaved); (2) subir o teto;
(3) enxugar os modelos da decoração. O usuário escolheu começar pela (2) e medir.

## Decisão
`kMaxHeapBytes = 1 GB` em `native/src/core/hermes_embed.cpp`, para todos os alvos (PC,
Steam, Xbox — a Xbox tem 10 GB de RAM). O teto continua existindo: o motivo do ADR-0153
(coleta regular em vez de crescimento) vale igual.

## Consequências
- A carga do crash cabe; RAM máxima do JS dobra (alvo mínimo de 2 GB do ADR-0153 fica
  mais apertado — o processo já usa ~2,1 GB de working set nesse jogo).
- Não remove o desperdício da fusão: as alternativas (1) e (3) continuam pendentes e
  são as que também atacam FPS.
