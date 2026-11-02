# ADR-0663 - Teto do heap do Hermes sobe para 3,75 GB

**Data:** 2026-11-02
**Status:** aceito (substitui o valor do teto do ADR-0278, que já tinha passado a 2 GB no commit `b567615b`; o motivo
de TER teto, do ADR-0153, continua)

## Contexto

O DDD 00 (Port Hollow) rodava a ~5–10 fps no export nativo, com pausas de GC de 60 ms a 1,6 s. A sonda de heap
(SPEC-0664) mostrou que a **memória externa** (ArrayBuffers de geometria e textura da cidade) chegava a **1.814 MB**
dos 2 GB do teto, contra 296 MB de heap JS. Como o teto do Hermes conta a memória externa, o coletor rodava uma
coleta completa atrás da outra: 77 em 6,5 s de trace.

A/B com o mesmo export do DDD 00 (240–300 s, autopiloto andando, mediana por quadro):

| | teto 2 GB | teto 3,75 GB |
|---|---|---|
| memória externa | 1.814 MB | 1.829 MB |
| coletas completas em 6,5 s de trace | 77 | 0 |
| render | 111,6 ms | 48,7 ms |
| world | 37,2 ms | 30,1 ms |
| trânsito (fatia do world) | 45% | 8% |

O trânsito "caro" (69 ms na grade de obstáculos, 62 ms nos motoristas) era GC caindo dentro dessas seções: elas
alocam um objeto por leitura do Rapier.

Alternativas:

1. **Subir o teto** até o máximo que o Hermes aceita (`gcheapsize_t` é de 32 bits).
2. **Liberar a cópia em CPU da geometria** depois do envio à GPU, reduzindo a memória externa. A física (trimesh,
   BVH de colisão), o raycast e o espelho nativo ainda leem esses buffers, então isso exige mapear cada leitor.
3. **Sem teto**: o problema do ADR-0153 (o Hades cresce o heap em vez de coletar) volta.

### Como o Godot faz

O Godot não tem GC: recursos usam refcount (`core/object/ref_counted.h:38-52`), e a geometria vive no servidor de
render, não num heap de script. O equivalente aqui seria a alternativa 2: a geometria fora do heap do JS.

## Decisão

Alternativa 1 agora: `kMaxHeapBytes = 0xF0000000` (3,75 GB), em `native/src/core/hermes_embed.cpp`, para todos os
alvos. A alternativa 2 fica no plano de performance do DDD 00 como próxima etapa de memória.

## Consequências

- No DDD 00, as coletas completas somem e o quadro cai de ~149 para ~79 ms (render + world).
- O teto fica perto do limite do tipo: um jogo que passar de ~3,7 GB de memória externa precisa da alternativa 2.
- A RAM máxima do JS quase dobra. A Xbox tem 10 GB; o alvo mínimo de PC do ADR-0153 fica mais apertado para jogos
  dessa escala.
