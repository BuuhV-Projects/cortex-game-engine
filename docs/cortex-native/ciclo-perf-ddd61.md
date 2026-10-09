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
