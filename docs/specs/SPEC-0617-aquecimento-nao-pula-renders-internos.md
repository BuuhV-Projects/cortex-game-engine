# SPEC-0617 - Aquecimento paralelo não pula os renders internos do three (céu preto)

**Data:** 2026-10-28
**Status:** aceito

## Contexto

No Gem Hopper (D:/jogos/gem-hopper), o céu panorâmico (`outdoorLighting.skybox`)
e o degradê (`skyTop/…`, além do degradê padrão derivado de `sky`) saíam **pretos**
no navegador (WebGPU). A textura estava em `scene.background`, e o fundo de **cor**
funcionava.

Isolamento na sonda headless (GPU real):

- degradê aplicado depois da carga → aparece;
- degradê + `game.precompile()` → preto;
- degradê + só o gancho de `drawWithParallelPipelines` (ADR-0310) → preto;
- o mesmo gancho, mas síncrono para objetos de **outra cena** → aparece.

Causa: um fundo equiretangular é convertido para cubemap por um **render interno**
do three (`CubeRenderTarget.fromEquirectangularTexture`, numa cena própria). O mesmo
vale para outros renders internos (a "Output Color Transform", PMREM). O gancho do
aquecimento transformava **todo** `updateForRender` em criação assíncrona, inclusive
esses. No quadro em que o pipeline ainda não estava pronto o desenho era pulado. A
conversão roda **uma vez só**, e o cubemap preto ficava em cache para sempre.

## Decisão

`drawWithParallelPipelines(threeRenderer, draw, root?)` recebe a cena aquecida.
Só os render objects **dessa cena** (`renderObject.scene === root`) têm o pipeline
criado de forma assíncrona. Os renders internos (outra cena) seguem o caminho
síncrono normal do three e desenham no mesmo quadro. Sem `root`, o comportamento
antigo é mantido (tudo assíncrono). O `Game._renderWarmupFrame` passa a cena ativa.

## Consequências

- Céu panorâmico e degradê voltam a aparecer em jogos que chamam `game.precompile()`
  (o template chama).
- Os pipelines das conversões internas (poucos) compilam de forma síncrona no
  aquecimento, sob a tela de carregamento. O custo é desprezível perto dos da cena.
- O host nativo não muda (ele usa `precompileNative`, fora deste caminho).
- Teste: `tests/core/WarmupFrame.test.ts` (render object de outra cena = síncrono).
