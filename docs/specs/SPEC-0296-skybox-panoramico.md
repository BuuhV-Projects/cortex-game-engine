# SPEC-0296 - Skybox panorâmico (`outdoorLighting.skybox`)

**Data:** 2026-10-03
**Status:** aceito
**Decisão:** ADR-0295

## Contexto

Céu desenhado (equiretangular PNG/JPG) como dado da cena, no lugar do código
que cada jogo escrevia.

## Decisão

- `SceneDefinition.outdoorLighting.skybox?: string` — URL do panorama 2:1.
- `SceneDefinition.outdoorLighting.skyboxLighting?: boolean` — default `false`.
- `Skybox.fromPanorama(scene, texture, { lighting?, environmentIntensity? }, renderer?)`
  (core): marca `EquirectangularReflectionMapping` + `SRGBColorSpace`, aplica em
  `scene.background` e, com `lighting`, também como environment (PMREM do
  engine via `setEnvironment`, mesmo caminho do HDRI).
- `buildScene`: depois do céu em degradê/HDRI, se `outdoor.skybox` estiver
  definido, carrega com `loadTexture(url, false)` (cache por URL) e chama
  `Skybox.fromPanorama`. O fundo do panorama vence o fundo do degradê; a luz só
  muda com `skyboxLighting: true`.
- Template de projeto novo: `assets/sky/ceu-tropical.png` + `"skybox"` no
  `outdoorLighting` do `scenes/level.json`.

## Consequências

- Sem `skybox`, nada muda.
- O crash-bandicoot-racer troca o carregamento manual (SPEC-0027 do jogo) pelo campo.
