---
name: validar-performance
description: Valida e diagnostica a performance de uma fase/jogo no host nativo (export) da cortex-game-engine — método de medição que não mente (simulação ativa, volta com IA, rodadas intercaladas, interruptores A/B, sonda de fases), orçamento por categoria e checklist do que derruba fps (sombra, assets, instancing, materiais, streaming) com as checagens de que as otimizações da engine estão ativas. Use quando o usuário pedir para medir/validar/otimizar a performance ou fps de uma fase, investigar travadas/picos, ou como etapa final ao construir uma fase nova (montar-fase / montar-jogo).
---

# validar-performance — medir certo e saber onde cortar

Destilada da campanha que levou a fase 2 do crash-bandicoot-racer de ~16 para ~70 fps
no host nativo (out/2026). Duas partes: **como medir sem se enganar** e **o checklist
do que olhar**. Cada item do checklist veio de um problema real, medido.

> Regra de ouro: **nenhuma otimização entra sem número antes/depois no host**, com o
> mesmo probe, e nenhuma conclusão sai de instrumento não validado.

## Parte 1 — Método de medição (o que não mente)

1. **Meça no host nativo**, não no Studio. O Studio roda V8 com JIT; o export roda
   Hermes sem JIT (exigência de console) — os gargalos são outros.
2. **Simulação ATIVA.** Probe com o mundo pausado mediu 44–56 fps numa fase que fazia
   16 jogando: o render subia 20→55 ms quando os karts se moviam. Sempre `dynamicGameplay`.
3. **Volta com a IA pilotando o jogador** (`?bench` do jogo — no crash-racer é a
   SPEC-0020; jogo novo precisa de um modo assim) para medir o percurso inteiro com a
   câmera de jogo: streaming, troca de LOD, trechos com mais karts na tela.
4. **Três níveis de instrumento, para perguntas diferentes:**
   - nível 0 (sem HUD/profiler) → **fps absoluto**;
   - nível 1 (`systemProfile`) → `cpuAvg.render/world/ui` no `perf-trace.jsonl`
     (só grava com profiler ligado — sem ele `cpuAvg` vem vazio);
   - nível 3 (`?renderPhases=3`, SPEC-0227) → fases do render (`rpBind`, `rpNodes`,
     `rpRefresh`, `writeBuffer`…). O HUD infla o frame: compare só deltas no mesmo nível.
5. **≥2–3 rodadas intercaladas por ponta, máquina ociosa.** Um subagente compilando o
   host contaminou uma rodada inteira (362 picos em vez de 49). Confira que não há outro
   `cortex_host.exe` rodando.
6. **Valide o instrumento** num caso de resposta conhecida antes de concluir. Interruptor
   tem que **relatar quanto desligou**; desconfie de número conveniente. Casos reais:
   contador `draw` do host não conta as cascatas do CSM; contadores `arraybuffers:` do
   `perf-log` são ACUMULADOS (memória viva é o `external=`); `frameMs` do trace satura em
   100 ms; `sys*` do trace acumula entre amostras; `console.log` do host imprime número em
   posição tardia como lixo (`1e-311`).
7. **Tempo fora do JS:** `CORTEX_FRAME_TIMING=1` grava no `perf-log.txt` as fases nativas
   (`js` / `present` / `resto`) e `gpu-latency`. Se `present` é pequeno, o gargalo é CPU.
8. **Pico ≠ média.** Para travadas, registre um log POR FRAME (envolva
   `__cortexTranscodeKtx2`, `AssetLoader.loadGLTF`, `__cortexGcStats`, stats do streaming)
   e cruze os frames lentos com o que aconteceu neles.
9. Teto do monitor: com vsync o fps não passa da taxa de atualização (75 Hz na máquina do
   usuário). Encostar nele = meta atingida, não custo da cena.

Probe de referência (crash-racer, fase 2): `exemplo-probe/main.ts` + `run.ps1` nesta
pasta — bundle com `native/scripts/bundle.mjs`, bytecode com `hermesc`, roda o host
escondido, opções `-Dynamic`, `-Bench`, `-ProbeLevel`, `-Capture` (paridade por pixel),
`-BundleEngine`/`-HostRoot` (testar uma worktree), `-Candidate <interruptor>`.
Adapte os imports do jogo; não meça com o probe de outra sessão em paralelo.

## Parte 2 — Orçamento por categoria (antes de escolher o alvo)

Rode interruptores A/B e monte a tabela `render`/fps de cada um:

| interruptor | o que mostra |
|---|---|
| sem sombra (`outdoorLighting.shadows=false`) | custo das cascatas |
| sem rivais/NPCs | custo de objetos móveis |
| mapa invisível (raiz do streaming `visible=false`) | custo do cenário |
| sem pós-processamento (`setPostFX(null)`) | custo do PostFX (no host é C++, costuma ser ~0) |
| sem o jogador | custo do personagem/veículo do jogador |

A diferença de cada um contra o normal é o orçamento. Ataque o maior primeiro.

## Parte 3 — Checklist da fase (decisões de conteúdo)

1. **Sombra:** `csm: true` com 3 cascatas e `shadowDistance` na escala do personagem
   (~220 m). **Nunca** um `shadowArea` gigante: 4 km num shadow map de 2048 deixa ~2 m por
   texel (personagem sem sombra visível) e desenha o mapa inteiro no passe de sombra.
   2 cascatas fizeram o passe nativo deixar de assumir — mantenha 3 e meça antes de mudar.
2. **Assets gerados por IA (um material por peça):** `yarn asset:refine` (atlas de
   paleta, ADR-0230). Use `--keep-hierarchy` quando o jogo procura pivôs por nome (rodas,
   volante) e `--keep <Material>` para material procurado por nome (pintura). Meta: poucos
   objetos desenhados por modelo (kart: ~60 → 6). Confira o visual com render antes/depois
   (`native/scripts/inspect-model.py`).
3. **Asset repetido (vegetação, rochas):** `InstancedMesh` por asset/LOD quando o GLB é
   uma malha sem transformação de nó (SPEC-0022 do crash-racer: 232 instâncias → até 12
   draws). A sombra nativa aceita instâncias (SPEC-0289).
4. **Materiais:** `KHR_materials_clearcoat` vira `MeshPhysicalMaterial` (mais caro por
   draw, ~1 ms nos 5 karts) — é só brilho de verniz, pode sair. `transmission` (vidro)
   custa mais, mas é visual relevante: só tire com aval do usuário.
5. **Streaming/LOD:** texturas repetidas entre LODs são transcodificadas a cada carga —
   prefira texturas compartilhadas; meça os picos de troca de LOD com o log por frame.
6. **Memória:** `external` do `perf-log.txt` bem abaixo do teto do Hermes (2 GB). Mapa
   com muitos LODs residentes chegou a 2,19 GB e caiu com OOM antes da SPEC-0286.
7. **Escala e câmera** influem: mapa 9× maior que o personagem multiplicava o que entra
   no raio de streaming e nas cascatas (SPEC-0016 do crash-racer).

## Parte 4 — Checar que a engine está fazendo a parte dela

Estas otimizações já são automáticas; a validação é ver que estão ATIVAS na fase:

| otimização | como conferir |
|---|---|
| transcode KTX2 fora da thread JS (SPEC-0287) | no log por frame, 0 ms de transcode dentro do frame |
| esfera de culling uma vez por geometria (SPEC-0288) | troca de LOD não custa mais que um frame comum |
| sombra nativa com streaming e instancing (SPEC-0289) | debug `perf`: `[shadowPass] ASSUMIU` estável; `DEVOLVEU motivo=...` só por 1 frame (`pendente`). Motivo permanente = bug a investigar |
| refresh só de transformação (ADR-0290/SPEC-0291) | `rpRefresh` perto do número de objetos que mudaram de verdade; contador do caminho rápido com `full` ≈ 0 |
| cópia em CPU do GLB liberada (SPEC-0286) | `external` estável ao longo da volta |

## Parte 5 — Relatório

Sempre em tabela, antes × depois, com fps, p50, p95, p99 e o cenário (largada/volta,
nível do instrumento, nº de rodadas). Diga o que NÃO foi medido. Registre a decisão em
spec/ADR (regra do repo) e o aprendizado na memória.
