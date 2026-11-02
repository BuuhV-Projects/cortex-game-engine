---
title: Carros estacionados sumiam só no export porque a DLL do Rapier era mais velha que o shim
author: Buuh
date: 2026-11-02
branch: claude/export-host-stale
cost: { minutes: 128, tokens: 866361 }
id: l-ddcea1fd
scope: repo
status: active
src: agent
touches:
  - CHANGELOG.md
  - package.json
  - docs/pendencias-refatoracao.md
  - src/core/NativeSceneMirror.ts
  - tests/core/NativeSceneMirror.test.ts
  - docs/cortex-game-engine/architecture.md
  - docs/specs/SPEC-0658-espelho-respeita-matriz-manual.md
  - docs/specs/SPEC-0659-standard-nativo-normalmap-metalrough-specular.md
  - src/core/PerfTrace.ts
  - docs/specs/SPEC-0660-export-recusa-host-desatualizado.md
---

## Decided
O export passa a recusar `cortex_host.exe`/`rapier_native.dll` mais velhos que os fontes, e um código desconhecido no `rn_body_set` não faz nada (SPEC-0660). No DDD 00, a DLL de 24/10 não conhecia o `sleep` (código 16, SPEC-0655): o braço padrão era a translação, então todo carro que assentava e dormia ia para (0,0,0), debaixo da rua, e caía. O trânsito não sofre porque é cinemático e não dorme; o Studio usa o Rapier WASM.

## Tried and ruled out
- `placeFleet` não aplicando: o bundle tem um JSON só e as vagas existem (180/50 no navegador).
- Quadro longo atravessando o chão: o `RapierPhysics.advance` divide em passos de no máximo 1/60 s.
- Trimesh do chão ausente ou errado: há 73 objetos de rua e 159 de terreno no Rapier do export, e `fromBufferAttribute` trata o atributo intercalado.

## Watch out
Física diferente só no export: compare a data de `native/build/rapier_native.dll` e `cortex_host.exe` com o último commit em `native/rapier-native/src`/`native/src` antes de olhar a lógica. A sonda que achou isso foi um dump temporário de posição de mundo no `PerfTrace` (o tempo do trace soma `deltaMs` limitado a 100 ms, então com quadros longos ele anda muito mais devagar que o relógio).

In the code: `native/scripts/host-freshness.mjs`, `native/scripts/export-game.mjs`, `rn_body_set` em `native/rapier-native/src/lib.rs`.
