---
title: "Export que congela minutos depois da carga (CPU 1 núcleo, RAM subindo, sem erro) =…"
author: Buuh
date: 2026-11-02
id: l-619fba13
scope: repo
status: active
touches:
  - src/scene/terrainLayerTextures.ts
  - "src/core/Game.ts#Game.precompile"
  - "src/core/Renderer.ts#Renderer.precompile"
  - "src/render/native/NativeRenderer.ts#NativeRenderer.precompile"
  - "src/core/sceneMirrorGate.ts#canInstallSceneMirror"
  - "src/core/WarmupFrame.ts#withoutShadowCasters"
  - "src/render/native/shadow/NativeSunShadowPass.ts#NativeSunShadowPass"
  - "src/scene/Terrain.ts#Terrain.loadLayerTexture"
  - "tests/core/PipelineBirthLog.test.ts#fakeBackend.createRenderPipeline"
---

## Decided
01/11/2026, export do Port Hollow (engine `fix/oom-export-mata`, 7e03ed45..c5ca22f7):

1. **OOM `external = 2,3 GB`** = `Terrain.loadLayerTexture` fazendo `new TextureLoader().load` por terreno × camada
   (176 × 4 = 704 decodificações iguais). Fix: cache por URL (`src/scene/terrainLayerTextures.ts`, SPEC-0652). O hook
   de contrato do template/jogo agora dá ERRO para loader do three direto no código do jogo.
2. **Congelamento depois da carga** (janela sem resposta, ~1 núcleo, RAM 1,7→5,7 GB, nenhum log) = `game.precompile()`
   pelo three: ~290 ms por `createRenderPipeline` no host, um shader por `InstancedMesh`. Duas causas: o espelho não
   instalava sob `setLoading(true)` (renderer próprio com `taken: 0`) e o `NativeSunShadowPass` devolvia `sem-mapa`, aí o
   three sombreava a cena inteira revelada. Fix SPEC-0653: `canInstallSceneMirror` + quadro de preparo
   `withoutShadowCasters` (as LUZES ficam — desligar a do sol faz o bloco de sombra perder o sol). Aquecimento: minutos → 15 s.

**Why:** OOM e congelamento só no host; no Studio nada aparece.

## Watch out
congelou sem erro → amostre CPU/WS do `launcher` e rode com `cortexDebug=1` (última linha = etapa).
Dentro de um quadro, perfilador temporário de métodos (proxy nos protótipos do Renderer/Backend/NativeRenderer e no
`device`, ranking impresso de DENTRO das chamadas a cada 5 s). Memória externa por origem: sonda com `Proxy` nos typed
arrays + embrulho de `__cortexReadFile/DecodeImage/Ktx2` (corrija `prototype.constructor` senão o three quebra). Depois
disso o jogo roda a ~10 fps (world 38 + render 51 ms) — perf é outra frente. Ver oom-hermes-fusao-estatica,
…

_From Claude Code's memory of this repo, last updated Nov 1._
