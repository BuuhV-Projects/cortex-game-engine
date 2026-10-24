# ADR-0566 — WGSL do jogo, relógio de shader e skinning no vertex shader do renderer nativo

**Data:** 2026-10-24
**Status:** aceito

Etapa R1.5 do PRD-0466 (ADR-0465), Frente C. Desenho na SPEC-0565.

## Contexto

O censo do R0 deixa, no DDD 61, só três recusas depois dos modelos fixos: nós TSL do jogo
(`colorNode` das tintas do player e dos estacionados; `colorNode+normalNode+positionNode` do
`peopleGpu`) e o `SkinnedMesh` do player e dos dublês. O PRD-0466 pede no R1.5 uma **API de WGSL
do jogo** (`userData.nativeMaterial`) que também sirva ao **mar** previsto ("Evolução prevista":
ondas no vertex shader, uniforme de tempo), e skinning sem mudar os modelos.

Havia três escolhas reais.

## Decisão

1. **Material do jogo = um `NativeModelDef` registrado pelo jogo** (`registerNativeMaterial`),
   o mesmo contrato dos modelos fixos. O material TSL marca `userData.nativeMaterial = '<nome>'`; o
   classificador já devolve `wgsl:<nome>`. O jogo escreve o WGSL de `vs`/`fs` contra o `coreWgsl` e
   recebe de graça instâncias, skinning, estado de pipeline, transparência e ordem. Ele declara
   atributos próprios (`attributeTypes`, incluindo `InstancedBufferAttribute` da geometria), lê
   texturas próprias (inclusive `DataTexture` float no vertex shader, com `textureLoad`) e escreve
   o próprio bloco de parâmetros.
   - Alternativa recusada: **tradutor de TSL para WGSL**. O `three` já faz isso e é exatamente o
     custo que o renderer próprio tira (ADR-0465); traduzir nós arbitrários é o problema inteiro
     do `NodeBuilder`.
   - Alternativa recusada: **ganchos de string no WGSL dos modelos fixos** (injetar trechos no
     `unlit`/`lambert`). Ficaria acoplado ao texto dos modelos das outras frentes, e qualquer
     mudança ali quebraria o jogo sem aviso.
2. **Tempo = relógio de shader do jogo** (`shaderTime`): soma do `dt` do `Game._update`, com
   *rollover* (como o `TIME` do Godot), no bloco de vista (`view.time`). O lado `three` do mesmo
   material lê o mesmo valor por um uniforme TSL exportado (`shaderTime`).
   - Alternativa recusada: o `time` do TSL (`NodeFrame.time`, relógio do renderer). Ele não para
     com o jogo e **não congela no `?parityFreeze`**: um objeto animado na galeria moveria os pares
     de controle, o ruído subiria e o instrumento ficaria cego (o `&nativeTint=1` deixaria de dar
     FAIL). Também é errado no menu de pausa (as ondas seguiriam).
3. **Skinning no vertex shader do núcleo** (ossos num storage buffer no grupo 3, com
   `bindMatrix`/`bindMatrixInverse`), a fórmula do `SkinningNode` do `three`.
   - Alternativa recusada (por ora): o **pré-passe de compute** do Godot (`mesh_storage.cpp:1149-1253`).
     Ele compensa quando a malha deformada é desenhada em vários passes (cascatas + pré-passe +
     cor). No DDD 61 são 1–4 malhas, desenhadas uma vez no passe principal; a sombra do player
     continua com quem a desenha hoje. Compute exigiria VB por instância, um pipeline de compute e
     ordem com o passe de sombra C++ (Frente B), e a paridade com o VS do `three` deixaria de ser
     direta.

## Consequências

- O jogo passa a manter **duas** descrições do material (TSL para o Studio e o `three`, WGSL para
  o export) e é responsável pela paridade entre elas. A galeria tem um exemplo provado; a Frente D
  porta `peopleGpu` e as tintas no repo do jogo.
- A API é pública (`src/index-runtime.ts`), entra no TypeDoc e no `engine-api.md`.
- `view.time` é `f32` com *rollover* de `SHADER_TIME_ROLLOVER_S`: a cada volta, a animação dá um
  salto (o mesmo comportamento do Godot); abaixo do *rollover*, a precisão do `sin` fica boa.
- Skinned + instanced continua recusado (`core:skinnedInstanced`), como no `three`, que não faz os
  dois juntos. Se o DDD 61 crescer para dezenas de personagens skinados, o compute volta à mesa
  (medir antes).
