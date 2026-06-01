# 0035 - Pós-processamento (WebGPU) e Skybox/HDRI no engine

**Data:** 2026-06-01
**Status:** aceito

## Contexto

Faltavam no engine duas capacidades comuns de render:

1. **Pós-processamento** (bloom, etc.). O pedido inicial foi "expor o
   `EffectComposer` do three".
2. **Skybox/HDRI** — iluminação e fundo baseados em imagem.

O engine é **WebGPU-only** (ADR-0032). Isso muda a resposta do item 1: o
`EffectComposer` clássico (`three/examples/jsm/postprocessing/EffectComposer.js`)
e seus passes (`RenderPass`, `UnrealBloomPass`, …) são **WebGL** — não têm
suporte ao `WebGPURenderer` (não mencionam WebGPU no código). Expor o
EffectComposer seria uma armadilha: importaria, mas não funcionaria com o
renderer do engine.

O three tem um caminho de pós-processamento **nativo de WebGPU**: a classe
`PostProcessing` de `three/webgpu`, composta com nós **TSL** (`pass`, `bloom`,
`mrt`, `output`).

## Decisão

**Pós-processamento** — caminho WebGPU, não EffectComposer. Há dois níveis:

1. **`PostFX`** (`src/core/PostFX.ts`) — classe consolidada, o caminho
   recomendado. Encapsula `RenderPipeline` + os nós TSL e aplica os efeitos numa
   ordem fixa correta: **bloom** (HDR) → **tone mapping + exposição**
   (HDR→LDR via `renderOutput`, com `outputColorTransform=false`) → **vignette**
   (LDR) → **fxaa** (LDR, por último):

   ```ts
   const postfx = new PostFX(renderer, scene, camera, {
     bloom: { strength: 0.9 },
     vignette: true,
     fxaa: true,
     toneMapping: THREE.ACESFilmicToneMapping,
     exposure: 1.1,
   });
   // no loop, em vez de renderer.render(...):  postfx.render();
   // ajuste em runtime: postfx.bloom?.strength.value = 1.2;
   ```

   O acumulador do grafo de nós é tipado como `any` internamente (a tipagem
   estrita do TSL não cobre uma cadeia mutável de nós); a API pública é tipada.
   A vinheta é um nó TSL escrito à mão (não há nó pronto no three).

2. **Blocos crus** re-exportados pra montar pipelines à mão:

   ```ts
   export { RenderPipeline, PostProcessing } from 'three/webgpu';
   export { pass, mrt, output } from 'three/tsl';
   export { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
   ```

   `RenderPipeline` é a classe atual; `PostProcessing` é o nome antigo
   (deprecado desde r183), mantido por compatibilidade. `RenderPipeline.render()`
   é síncrono (exige `renderer` já inicializado).

Para isso, `Renderer` ganhou o getter **`threeRenderer`** (instância interna do
`WebGPURenderer`), antes não exposta. `PostFX` guarda os defaults de bloom
(`strength 0.8`, `radius 0`, `threshold 0`) e faz no-op enquanto o backend
WebGPU não inicializou (mesma guarda do `Renderer.render`).

**Skybox/HDRI** — novo módulo `src/core/Skybox.ts` com `Skybox.fromHDRI(scene,
url, opts)`: carrega um HDRI equiretangular (`RGBELoader`), seta
`mapping = EquirectangularReflectionMapping` e aplica em `scene.environment`
(iluminação/reflexo PBR) e, opcionalmente, `scene.background` (com
`backgroundBlurriness`/`environmentIntensity`). **Sem `PMREMGenerator`**: o
`WebGPURenderer` aceita a textura equiretangular direto em
`environment`/`background`. Também re-exporta `RGBELoader` e
`EquirectangularReflectionMapping` pra uso avançado.

`Skybox` entrou em `VENDOR_TYPE_MODULES.core` (electron/main.ts) pra que seu
`.d.ts` seja vendorizado em projetos novos e alimente o IntelliSense.

## Consequências

- Pós-processamento e HDRI passam a ser de primeira classe no engine, sem o
  projeto importar `three` direto (ADR-0021).
- **Não** expomos o `EffectComposer` clássico. Se algum dia o engine ganhar um
  modo WebGL (escape hatch `forceWebGL`), revisitar pra oferecer o caminho
  clássico só nesse modo.
- `bloom` vem de `examples/jsm/tsl/display/BloomNode.js` (não de `three/tsl`);
  `pass`/`mrt`/`output` vêm de `three/tsl`. Os tipos resolvem via `@types/three`
  (`build/three.tsl.d.ts`, `build/three.webgpu.d.ts`).
- O bundle do engine cresceu ~140 KB (os nós TSL de pós-processamento).
- Caveat de editor (igual aos outros addons): no projeto, os re-exports
  `from 'three/webgpu'`/`'three/tsl'` podem aparecer como "cannot find module"
  no TS standalone (o projeto não tem `three` no `node_modules`); em runtime o
  bundle resolve. O `engine:readTypes` do IDE alimenta os tipos no editor.
