# Débito técnico do export nativo

Gerado por `.claude/hooks/native-contract.mjs` (não edite à mão). Cada item é algo que o jogo usa e o
nativo ainda não tem: o objeto cai no three em JS (ou a sombra volta para o three) e o quadro fica caro.

## AmbientLight: o bloco de luz nativo só tem sol + hemisfério + spots; o renderer próprio recusa a cena inteira

- `src/scene/OutdoorLighting.ts`
- `src/scene/SceneBuilder.ts`

## MeshPhysicalMaterial: o renderer próprio recusa

- `native/fixtures/material-gallery/main.ts`

## nó TSL no material sem `userData.nativeMaterial` (WGSL do jogo): o renderer próprio recusa

- `src/render/native/ShaderClock.ts`
- `src/render/shadowAlphaClipKeys.ts`
- `src/scene/CartoonWaterMaterial.ts`
- `src/scene/Materials.ts`
- `src/scene/terrainSplatMaterial.ts`
- `src/ui/runtime/uiBackendMaterials.ts`

## scene.environment: o renderer próprio recusa o objeto (`lights:environment`)

- `src/core/Scene.ts`
- `src/core/Skybox.ts`

## toneMapping no renderer do three: o renderer próprio recusa tudo (ACES vai no composite, PostFX nativo)

- `src/core/PostFX.ts`
- `src/core/Renderer.ts`
- `src/scene/OutdoorLighting.ts`
