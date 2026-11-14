# SPEC-0732 - Shader de sombra e variantes enxutas no renderer nativo

**Data:** 2026-11-13
**Status:** implementado

## Contexto

No export nativo do Port Hollow (Hermes + wgpu D3D12 + FXC), o `game.precompile` leva ~12 s. Desses, 8,3 s são
criação de pipeline, e quase todo esse tempo é a compilação FXC do fragment shader. Os 32 pipelines com
`receiveShadow` somam 88%: uma variante `standard` sem sombra compila em ~71 ms, e a mesma com sombra em ~612 ms.

A causa está no bloco de sombra do sol (SPEC-0545, SPEC-0690):

- `nativeShadowPcf` (`frame/shadow.ts`) faz as 16 leituras do PCFSoft do three, e cada uma chama `nativeShadowTap`.
- `nativeShadowTap` (`frame/shadowCsm.ts`) é um `switch` de `CSM_MAX_CASCADES = 6` casos, cada um com um
  `textureSampleCompareLevel`. São 96 leituras por PCF.
- O PCF aparece em três lugares: o mapa único e os dois laços do `nativeShadowCsm` (com e sem `fade`). O FXC
  inlina tudo, e cada fragment que recebe sombra fica com ~288 sítios de `textureSampleCompareLevel`. O jogo usa 2
  cascatas (`shadowCascades: 2` no `createOutdoorLighting`, o log diz `cascadas=2`).

Há também variantes que multiplicam módulos sem mudar o resultado (`models/lambert.ts`, `models/standard.ts`):

- `doubleSide` só entrava na variante com `side === DoubleSide`. O código dele é `normal *= sign(isFront)`, mais o
  sinal da face no normal map. Num `FrontSide`, o pipeline usa `cullMode: 'back'` (`drawState`), e só faces da frente
  são rasterizadas. Então `isFront` é sempre `true` e o sinal é sempre `1.0`. `BackSide` é recusado
  (`litRefusal`), e objetos espelhados também (`mirrored`).
- `alpha` (material não opaco, `NodeBuilder.isOpaque()` do three) só decidia se a linha `diffuse.w = 1.0` entrava.

Cada variante a mais é outro módulo e outro pipeline para o FXC compilar.

## Decisão

### 1. O WGSL da sombra só com as cascatas em uso

- O WGSL do bloco sai de `shadowWgsl(cascades)` (`frame/shadowWgsl.ts`). `cascades` é quantas cascatas o
  shader lê: `0` só tem o mapa único (SPEC-0545). Com `N > 0`, ele lê as cascatas `0..N-1`.
- **Sem `switch` no tap.** Cada mapa `k` tem sua própria `nativeShadowTap{k}` e `nativeShadowPcf{k}`, com o nome da
  textura escrito no código (`nativeShadowMap` para `k = 0`, `nativeShadowMap{k}` para as outras). O mapa único e a
  cascata 0 usam o mesmo binding 10 e a mesma `nativeShadowPcf0`.
- **O `nativeShadowCsm` é gerado desenrolado,** com um bloco por cascata (`if (ku < count)`). Cada bloco calcula se
  o ponto cai na cascata e o peso dela (`fade` ligado: a margem `0,25 · borda²` do `_setupFade`; desligado: a faixa
  do `_setupStandard`), e chama `nativeShadowCascade{k}` **uma vez**. O resultado escolhe a fórmula pelo `fade` com
  `select`: sem fade, `ret = fator`; com fade, `ret = ret - (1 - fator) · ratio`. As contas são as mesmas da
  versão anterior, na mesma ordem, e a paridade com o three (`csmCascadeMath.ts`) continua valendo.
- Com 2 cascatas, o fragment tem 32 sítios de `textureSampleCompareLevel` (16 por mapa), contra ~288 antes.
- O UBO não muda: continua com as 6 cascatas (`CSM_MAX_CASCADES`), e o layout do grupo 1 continua com os bindings
  10..15. Um binding que o shader não declara é permitido num layout explícito.

**De onde vem o número.** É o `count` do `CsmReceiverState` do nó CSM (`CameraFollowingCSM`, opção `cascades` do
`createOutdoorLighting`, `shadowCascades`), o mesmo que o passe C++ desenha, limitado a `CSM_MAX_CASCADES`. O
`ShadowBlock` lê esse número a cada `update` (em `beginFrame`, antes dos draws).

- O número compilado só cresce. Quando o `count` passa do compilado, o bloco recompila com o novo número, aumenta o
  `version` (o grupo 1 é refeito e as receitas antigas ficam velhas pela `_frameGeneration`) e muda o `codeKey`. Se o
  `count` cair (ou o sol sumir por uns quadros), o shader fica como está: ele lê `count` do UBO e ignora as cascatas
  além dele. Assim o jogo não recompila tudo por uma oscilação.
- Antes do 1º `update`, o compilado é 0. Nenhum pipeline nasce antes disso: o `recipeFor` só roda depois do
  `beginFrame`, e o `precompile` vem depois do quadro de aquecimento.

**Chave do código.** `FrameBlock` ganha `codeKey?: string`, que muda junto do `wgsl` (o bloco de sombra usa
`shadow:<N>`). O `NativePipelineStore` recebe os blocos em vez do WGSL pronto. Ele junta as `codeKey` na chave do
módulo e do pipeline, e refaz o WGSL do grupo 1 quando a chave muda. O bloco de luzes não tem `codeKey`: o WGSL dele
é fixo.

### 2. `doubleSide` e `alpha` fora da variante

- `litVariant` não põe mais `doubleSide` na variante. O `litSurfaceWgsl` sempre gera
  `normal = normalGeometry * vec3<f32>((f32(isFront) * 2.0) - 1.0);`, e o normal map sempre usa esse sinal de face.
  Num `FrontSide`, o sinal vale `1.0`, e o resultado é o mesmo de antes. No `DoubleSide`, a normal continua invertida
  na face de trás.
- `alpha` continua aceito pelos modelos (o censo e o `litRefusal` não mudam), mas sai da variante. Os parâmetros
  lit ganham uma linha, `litFlags : vec4<f32>` (`LIT_PARAM_FLOATS` passa de 8 para 9 linhas; os campos do
  `standard` e do `terrainSplat` vêm depois dela, pelas constantes derivadas). Em `litFlags.x` vai `1` quando o
  material é opaco (`isOpaqueMaterial`: `!transparent && blending === NormalBlending`, a mesma regra do
  `NativeRenderer`). O shader faz `diffuse.w = select(diffuse.w, 1.0, params.litFlags.x != 0.0);`: o opaco continua com
  alpha 1, e o transparente sai com o alpha real.
- O `alphaTest` continua variante. Um `discard` sempre presente desligaria o early-Z de todos os opacos.
- O `unlit` não muda (ele tem o próprio `alpha`, fora do escopo desta SPEC).
- O estado do pipeline (blend, cull, depth) já está na chave do pipeline. Um material opaco e um transparente
  com o mesmo resto da variante passam a dividir o **módulo**, mas cada um mantém seu pipeline.

## Consequências

- Os fragments com sombra ficam com 16·N leituras de comparação no código, contra 96 por PCF antes. A estimativa
  para o Port Hollow é de 8 a 9 vezes menos sítios de leitura no shader que o FXC compila.
- As variantes `lambert`/`standard` que só diferiam por `doubleSide` e/ou `alpha` passam a ser uma só. Até 4
  variantes de uma combinação viram 1 módulo.
- Trocar o número de cascatas em tempo de jogo para cima recompila os pipelines com sombra uma vez. Para baixo, nada
  muda.
- `CSM_WGSL` (constante) deixa de existir. O `csmWgsl(cascades)` e o `shadowWgsl(cascades)` geram o código.

### Validação

- `tests/render/native/shadowWgsl.test.ts`: com 2 cascatas não há `nativeShadowMap2..5` nem leituras deles, e o
  código muda com o número. Há 16 leituras por mapa e nenhum `switch` no tap. O `ShadowBlock` recompila e aumenta o
  `version` quando o `count` sobe, e não recompila quando ele cai. O `NativePipelineStore` gera módulos novos quando
  a `codeKey` muda.
- `tests/render/native/litVariants.test.ts`: as variantes que eram distintas por `doubleSide`/`alpha` dão o mesmo
  WGSL. O opaco escreve `litFlags.x = 1` e o transparente `0`. O sinal da face continua no código.
- A paridade de sombra, CSM, lambert e standard (`shadow.test.ts`, `shadowCsmBlock.test.ts`,
  `csmCascadeMath.test.ts`, `lambert.test.ts`, `standard.test.ts`, `CameraFollowingCSMNative.test.ts`) continua verde,
  com as asserções ajustadas ao código novo.
