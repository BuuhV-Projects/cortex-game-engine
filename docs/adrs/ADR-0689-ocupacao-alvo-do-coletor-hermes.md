# 0689 - Ocupação-alvo do coletor do Hermes em 0,7

**Data:** 2026-11-04
**Status:** aceito (complementa o ADR-0663: o teto continua em 3,75 GB)

## Contexto

O DDD 00 fechou sozinho depois de ~21 min dirigindo, na volta pelo mapa do jogo (SPEC-0132 de lá). O quadro estava
normal (13 ms) e o Windows não registrou crash. No último instante, o heap JS (1,30 GB) mais a memória externa
(2,06 GB) somavam ~3,36 GB. O teto do heap é de 3,75 GB (ADR-0663) e conta os dois.

A causa é a ocupação-alvo padrão do Hades (0,5). O alvo da geração velha é (vivo + externo) / ocupação:
(175 MB + 2054 MB) / 0,5 ≈ 4,35 GB, que o teto corta para 3,75 GB. A coleta velha só dispara com
(alocado + externo) perto de 0,876 desse alvo, ~3,36 GB. Então o lixo JS chega a ~1,3 GB antes de qualquer coleta, e
a coleta grande precisa de espaço extra justamente colada no teto. Na volta anterior ela disparou com 3.363 MB e
passou; nesta, com a gravação de vídeo ligada, não passou.

O heap grande também encarece a coleta jovem, que varre os segmentos da geração velha: ela foi de 0,5 ms (heap de
268 MB) a 2,3 ms (1,34 GB) ao longo da volta.

## Alternativas

1. **Ocupação-alvo 0,7.** O alvo cai para (175 + 2054) MiB / 0,7 ≈ 3.184 MiB, abaixo do teto (3.840 MiB). A coleta
   velha dispara perto de 0,876 do alvo, ~2.790 MiB: com ~0,55 GiB de lixo, e ~1 GiB longe do teto.
2. **Ocupação-alvo ≥ 0,85.** O alvo cola no vivo, e o coletor volta a coletar quase sem parar: o mesmo problema que o
   teto de 2 GB causava (ADR-0663: 77 coletas completas em 6,5 s).
3. **Soltar a cópia em CPU da geometria** depois do envio à GPU (a alternativa 2 do ADR-0663). É o conserto de fundo
   da memória externa, mas a física, o raycast e o espelho nativo ainda leem esses buffers.
4. **Coleta periódica forçada** (`collect()`). É bloqueante e compacta: medida em 655 ms na carga.

Também foi medido soltar o RGBA decodificado das imagens depois do upload: a memória externa caiu só 78 MB
(1.946 → 1.868 MB), porque ela é quase toda geometria. Não entrou.

## Decisão

Alternativa 1: `kOccupancyTarget = 0.7` em `native/src/core/gc_policy.h`, ligado no `hermes_embed.cpp` com
`withOccupancyTarget`, para todos os alvos. O teto (`kMaxHeapBytes`) foi para o mesmo arquivo. O teste de host
`testGcOccupancyTargetKeepsMarginBelowCap` fixa a margem com a memória medida do DDD 00. A alternativa 3 continua no
plano de desempenho do DDD 00 como o conserto de fundo da memória.

## Consequências

- A coleta velha roda mais vezes (a cada ~0,55 GiB de lixo, uns 11 min no DDD 00). Ela é concorrente: CPU medida de
  ~15 ms por coleta, fora do quadro.
- O heap JS fica menor, e a coleta jovem para de encarecer ao longo da sessão.
- Um jogo cuja memória externa passe de ~2,5 GiB volta a ter o alvo cortado pelo teto: aí só a alternativa 3 resolve.
