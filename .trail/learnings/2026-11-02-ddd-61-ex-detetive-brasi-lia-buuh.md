---
title: DDD 61 (ex-Detetive Brasília
author: Buuh
date: 2026-11-02
id: l-9be1a2a3
scope: repo
status: active
touches:
  - "electron/main.ts#vendorEngine"
  - "src/scene/VehicleSetup.ts#setupVehicle"
  - "tests/editor/PhysicsAuthoring.test.ts#setup.physics"
---

## Decided
**Nome do jogo: DDD 61** (decisão do usuário, 2026-10-07; antes chamado Detetive Brasília — SÓ a pasta segue `D:/jogos/detetive-brasilia` (o usuário não quer renomear a pasta); id do cortex.json `ddd-61`, name `DDD 61`, package `ddd-61`, chaves de save `ddd-61:*`, Tauri local (fora do git) productName `DDD 61`/identifier `com.cortex-game.ddd-61`). Desde 2026-10-04 o usuário evolui o jogo **DDD 61**, estilo **GTA 3** (gráfico de
GTA 3 basta, não precisa SA): um **policial — mais pra DETETIVE (à paisana) — que combate
crimes por Brasília**. Começa na **Ceilândia (Setor O, quadra QNO)** e a cidade cresce aos
poucos (outras QNOs, avenidas, depois outras RAs).

Onde está: **`D:/jogos/detetive-brasilia`** (projeto próprio, engine vendorizada, git próprio
na `main`). Nasceu como `examples/ceilandia-setor-o` na engine e foi movido a pedido do
usuário (jogos-ficam-em-d-jogos). `yarn dev` (porta 5174; editor F2 abre sozinho em dev →
Play ou `?play=1`; `?hora=22`, `?escala=60`), `yarn test`. Specs do jogo: SPEC-0001 bairro,
0002 carro (60 km/h), 0003 NPCs + dia/noite, 0004 ocorrência (chamado → fuga → prisão a pé),
0005 radar + menu (Esc/Start pausa; mapa pré-pintado em canvas, `ui/`), 0006 destino no mapa
(mira + Enter/Ⓐ) e seta NFS sobre o carro só dirigindo (alvo = destino, senão ocorrência).
A seta é CHAPADA a 2,6 m — versão 3D extrudada a 3,4 m foi testada e o usuário preferiu a chapada.
…

## Watch out
cada passo puxa pro tema investigação (ocorrências, perseguição, suspeitos,
pistas). Ele é DETETIVE: carro comum (não viatura) e roupa à paisana — o usuário corrigiu
quando fiz viatura+farda. Nada de brasão/identidade real da PMDF/PCDF. Só use símbolos que
`cortex-game-engine` re-exporta (faltam CanvasTexture, IcosahedronGeometry, LineSegments,
mergeGeometries — o jogo usa Texture/SphereGeometry/caixas finas/`mergeFlat`). Validar no
Chrome headless (painel do app congela rAF — gotcha-painel-navegador-congela-raf);
…

_From Claude Code's memory of this repo, last updated Oct 4._
