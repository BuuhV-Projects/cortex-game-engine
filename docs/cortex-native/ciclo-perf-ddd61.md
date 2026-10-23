# Ciclo de performance do export nativo — DDD 61 (PAUSADO)

**Pausado em:** 2026-10-09, a pedido do usuário (voltou ao desenvolvimento do jogo).
**Estado:** engine com o ciclo até `e1219418` (host recompilado), jogo
`D:/jogos/detetive-brasilia` em `dff1386`.

## Objetivo

Export nativo (PC/Steam e Xbox: Hermes + wgpu) do DDD 61 a **75 fps** (13,3 ms por quadro).
Marco intermediário decidido pelo usuário: **primeira versão a 60 fps** — nos 5 pontos, mediana
do quadro < 16,7 ms, p95 ≈ 16,7 ms e nenhuma travada. Sem trava de fps: o vsync segue o
refresh da tela.

## Onde parou (medição R3b, engine 96d6cb34, antes da SPEC-0333 b.2)

| ponto (`?spawn=`) | R0 | R2b | R3b | quadro med / p95 (ms) |
|---|---|---|---|---|
| setorO | 17,8 | 48,5 | 58,8 | 17,0 / 23,7 |
| centro | — | 50,5 | 53,1 | 18,9 / 29,7 |
| comercial | 14,9 | 40,3 | 49,8 | 20,1 / 34,0 |
| ac | — | 48,8 | 55,4 | 18,1 / 27,4 |
| helio&drive=1 | 18,4 | 52,6 | 61,2 | 16,4 / 25,3 |

A b.2 (lote de desenho em C++, `e1219418`) entrou depois e vale −0,6 a −0,9 ms no quadro.
A GPU usa ~0,3 ms por quadro: o teto é a CPU (JS no Hermes). Zero quadros ≥ 60 ms; soak de
10 min estável. **O marco de 60 não passou por causa da cauda (p95 1,4–1,7× a mediana).**

## O que entrou no ciclo (para não refazer)

- R1: SPEC-0319/0320/0321.
- R2: SPEC-0322 (espelho só nós sujos), 0323, 0325; rejeitadas SPEC-0326/ADR-0327 (poda do
  `_projectObject`).
- R3: SPEC-0328 (raycast por grade), 0334 (instrumento honesto: `gpu-work`, pass-timing,
  trace em rodízio), ADR-0330 + SPEC-0331 (rejeitada) / 0332 (projeção em C++) / 0333
  (desenho direto b.1 + lote b.2), ADR-0336 / SPEC-0337 (Rapier vendorizado com patch),
  SPEC-0340/0341 (luzes e áudio no nativo).
- No jogo: SPEC-0118 a 0122.

## Próximos passos (R4 — parada no meio, sem commits)

O trabalho não commitado ficou nas worktrees abaixo. Ao retomar, confira o estado delas
antes de continuar; remova junctions com `cmd /c rmdir` antes de apagar uma worktree.

| frente | worktree / branch | o quê | ganho esperado |
|---|---|---|---|
| A — cauda | `.claude/worktrees/r4-a-cauda` / `perf/r4-cauda` | decompor o p95: quantização do vsync (75 Hz), sub-passos do Rapier (`FIXED_DT` 1/60), GC; corrigir a maior causa (ex.: passo desacoplado + interpolação) | p95 ≤ ~1,2× mediana |
| B — raycast | `.claude/worktrees/r4-b-raycast` / `perf/r4-raycast-nativo` | raycast da câmera e do personagem em C++ (BVH nativo, matrizes do SceneMirror) | −1,5 ms no comercial |
| C — update do jogo | `D:/jogos/detetive-brasilia-r4-c` / `perf/r4-update-comercial` | multidão/figuras em forma fechada; ônibus; menos alocação | −1 ms no comercial |
| D — congelamento | `.claude/worktrees/r4-d-congelamento` / `fix/congelamento-host` | reproduzir o congelamento visto 1× aos ~102 s (engine 5c251f18) ou deixar um watchdog no host que grave o estado | correção |
| F1 — próximo corte | (nova) | levar ao C++ o laço `_renderObjects` dos objetos limpos (o C++ já tem candidatos e receitas) | ~1–3 ms no render |

### R4-A medida e descartada (2026-10-22)

Sonda temporária por quadro (o `TailProbe` da worktree `r4-a-cauda`, portado para a `main` c44d6554
e removido depois): dt, tempo de JS, nº de passos e tempo do `world.step()`, custo por sistema e GC.
Export release do jogo `aacfb7e` (merge do Guará), 5 pontos + dirigindo, t ≥ 30 s. Máquina carregada
(outras sessões compilando): js mediano 14–18 ms.

| ponto | js p50 / p95 | quadros com 2+ passos | 2 passos − 1 passo: render / `VehicleControlSystem` | GC jovem na cauda vs geral |
|---|---|---|---|---|
| Setor O | 19,8 / 30,9 | 83 % | +2,39 / +0,22 | 44 % / 16 % |
| Centro | 16,6 / 25,7 | 57 % | +2,10 / +0,35 | 41 % / 16 % |
| Comercial | 18,2 / 25,6 | 83 % | +1,02 / +0,18 | 51 % / 20 % |
| Águas Claras | 17,2 / 27,0 | 61 % | +1,85 / +0,88 | 42 % / 16 % |
| Guará | 16,4 / 29,4 | 54 % | +2,47 / +0,49 | 46 % / 16 % |
| dirigindo (Hélio) | 14,0 / 29,4 | 33 % | +2,67 / +0,40 | 30 % / 15 % |

- O `world.step()` custa ~0,15–0,25 ms por passo; o sub-passo extra inteiro (veículo + passo) custa
  **0,2–0,9 ms**, contra um p95 8–15 ms acima da mediana.
- Os quadros de 2 passos são mais caros sobretudo no **render** (+1,0…+2,7 ms), que não depende de
  passo: é autocorrelação (um trecho de render pesado perde o vsync; o quadro seguinte, também pesado,
  recebe dt de 26,7 ms e faz 2 passos). Não há realimentação pela física.
- O caso que importa a 75 Hz (perdeu o vsync → 2 passos) só some com passo ≥ 1/37 s, grosso demais para
  o veículo (ADR-0257).
- **Descartada:** nenhuma mudança na física. A cauda segue no render e no GC jovem (presente em 30–51 %
  dos quadros da cauda contra 15–20 % no geral) — frentes B1 (alocação) e de render.

**Reconfirmada no jogo `e2be01c`** (main do DDD 61, 2026-10-23; engine `5c970b0c` com host recompilado;
kit SPEC-0382). O jogo é mais pesado: js mediano 21–28 ms, então 100 % dos quadros têm 2+ passos e a
comparação passa a ser 3 passos contra 2:

| ponto | js p50 / p95 | 3 passos − 2: render / update / `VehicleControlSystem` | GC jovem na cauda vs geral |
|---|---|---|---|
| Setor O | 21,5 / 28,8 | +1,99 / +0,94 / +0,24 | 80 % / 26 % |
| Centro | 21,8 / 30,0 | +1,27 / +0,75 / +0,40 | 83 % / 24 % |
| Comercial | 26,0 / 35,8 | +4,78 / +0,63 / +0,22 | 74 % / 31 % |
| Águas Claras | 27,6 / 39,5 | +2,76 / +1,52 / +0,33 | 75 % / 30 % |
| Guará | 21,3 / 30,6 | +1,55 / +0,80 / +0,30 | 70 % / 27 % |

`world.step()` ~0,19–0,24 ms por passo. Mesma leitura: o passo extra custa ~0,2–0,4 ms; o excedente está
no render e no GC jovem. O ponto dirigindo não rodou nessa base (crash ao bater num prop, corrigido
depois pela SPEC-0394).

Pendências fora das frentes:

- **Memória:** no soak de 10 min o vale do `external` pós-GC subiu 297 → 318 MB e o working
  set 1,55 → 2,03 GB (VRAM plana). Fazer um soak de 30–60 min para separar reserva de
  vazamento.
- **Decisão do usuário:** o `stepDriver` do trânsito (~0,7 ms) só cai mais mudando o
  comportamento dos carros distantes.
- **Áudio do shim:** `playbackRate` não muda com o som tocando; a lista de vozes encerradas
  só cresce (SPEC-0341, fora de escopo).

## Método (não pular)

- Export **release**, nunca `--debug`; `node_modules` real (junction duplica módulos — compare
  o tamanho do `boot.hbc`).
- A deriva da máquina é grande: A/B sempre **intercalado** A,B,A,B; análise com t ≥ 30 s.
- Lock de medição `.cortex/measure.lock` (mkdir atômico). Ao terminar ou matar uma rodada:
  **restaurar o save do usuário e só depois soltar o lock** (try/finally).
- Save do usuário em `%APPDATA%/ddd-61/saves/localStorage.json`: backup antes, restauração
  exata depois. Nunca escrever nos exports do usuário (`Documents/builded-*`).
- Scripts prontos: `.cortex/r3b-ddd61/` (`run.ps1` com detector de congelamento, `table.mjs`,
  `soak-analyze.mjs`), `.cortex/r3-f3/drive.ps1` (piloto), `.cortex/r3-f4/cpuprof.mjs`
  (perfil de CPU/alocação do jogo).
- Instrumentos que já mentiram: somar fases do render (dupla contagem em recursão), o
  `gpu-latency` antigo e o pass-timing de 64 slots. Valide o instrumento num caso conhecido.
