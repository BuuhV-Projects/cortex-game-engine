# SPEC-0616 — R2.1: UI de runtime desenhada pelo renderer próprio (WGSL de UI)

**Data:** 2026-10-26
**Status:** em implementação. Etapa R2.1 do PRD-0466 (R2). Decisão: ADR-0615. Base: ADR-0465, ADR-0102,
ADR-0105, SPEC-0495 (núcleo do renderer), SPEC-0382 (kit de medição), SPEC-0515 (1080p).

## Contexto

No export do DDD 61 a UI de runtime é a última coisa que o `three` desenha em todo quadro: o
`RendererUiBackend` monta uma cena ortográfica e o `Renderer.renderUiLayer` a desenha numa RT
`rgba16float` própria, que o host compõe sobre o jogo em gama (`__cortexUiLayer`, ADR-0105).

**Linha de base** (`r1-accept3`, DDD 61 `5bbf6a3`, nativo, `walk`, 1080p, rodadas limpas, média de `t ≥ 30 s`):

| ponto | `ui` (ms/quadro) | render (ms/quadro) | `precompile` (s) |
| --- | --- | --- | --- |
| Setor O (3) | 2,05–2,41 | 7,33–8,54 | 7,2–7,6 |
| Centro (3) | 2,03–2,23 | 7,70–8,52 | 7,3–7,5 |
| Comercial (2) | 2,09–2,39 | 7,41–8,31 | 7,3–8,0 |
| AC (3) | 2,09–2,26 | 7,52–7,93 | 7,4–7,8 |

A seção `ui` do profiler soma `ui.update` (navegação + `sync` dos widgets) e `ui.render` (o desenho). O
`precompile` já caiu de 39,7 s (o número do PRD, anterior ao R1.6) para ~7,5 s com 103 lookups.

## Como o Godot faz (4.7.2-stable, `ed1daf0b`, `servers/rendering/renderer_rd/`)

- **Um registro por retângulo, 128 bytes:** `InstanceData` com transform 2D, modulação, retângulos de
  destino e origem e flags (`renderer_canvas_render_rd.h:356-380`).
- **Um buffer de instâncias por quadro**, mapeado e escrito em sequência (`_allocate_instance_buffer`,
  `renderer_canvas_render_rd.cpp:3309-3311`), descarregado uma vez no fim (`:921-929`).
- **Lotes:** `_record_item_commands` abre lote novo só quando muda o que o draw não consegue variar por
  instância — textura (`:2464-2467`), MSDF/LCD (`:2451-2462`); cada retângulo vira um registro
  (`new_instance_data`, `:2469`).
- **Um draw instanciado por lote:** `_render_batch` liga o buffer de instâncias **como vertex buffer, com
  offset `start × sizeof(InstanceData)`**, e desenha o quad com `instance_count` (`:3072-3076`). Não
  depende de `first_instance`.
- **Variantes por define** (retângulo, nine-patch, primitivo: `:1754`), não por material.
- O canto arredondado do `StyleBoxFlat` é **polígono gerado na CPU** (`scene/resources/style_box_flat.cpp:316`,
  `draw_rounded_rectangle`).

## Como fazemos hoje

- Uma malha `three` por caixa, sombra dura, imagem, texto e `<canvas>` (`RendererUiBackend._apply`); a
  caixa e a imagem são `MeshBasicNodeMaterial` com SDF em TSL; texto e `<canvas>` são
  `MeshBasicMaterial` com `map` e blend custom (premultiplicado na RT).
- O `three` percorre a cena, ordena os transparentes (`renderOrder`, `z`, `id`), confere cada objeto e
  desenha um draw por malha num `render()` próprio (com o `beginRender`/`finishRender` dele).

## Validação de aplicabilidade

- **Buffer de instâncias como vertex buffer por instância:** cabe direto no WebGPU (`stepMode: 'instance'`,
  `setVertexBuffer(slot, buffer, offset)`). Os cantos do quad saem do `vertex_index`; não há vertex buffer
  de geometria. Fica de fora a dúvida do `firstInstance` no D3D12 (SPEC-0585 P3).
- **Lote por textura:** caixas não têm textura (ligam uma textura branca 1×1), então caixas
  consecutivas viram um draw; cada texto tem a sua textura (um raster por `Label`), então cada texto é um
  lote. Com o HUD do DDD 61 (~30 quadriláteros), sai na ordem de 15–25 draws, contra ~33 `renderObject`.
- **Canto por polígono (Godot): não se copia.** A imagem tem de ficar igual à do `three` (e à do Studio,
  que usa o mesmo TSL); o SDF entra no fragment.
- **Texturas:** enquanto o `WebGPURenderer` existe, o upload continua o do `three` (texto, `<canvas>`,
  imagem), como no `NativeRenderer` (SPEC-0495). O desenhista só pede "textura → (vista, sampler)" e só
  chama o upload quando `texture.version` muda (lição do 1a da SPEC-0585: `updateSampler` por quadro aloca).
- **Hermes:** nada de `for…of` em `Map` nem closure em laço no caminho por quadro (SPEC-0357).

## Desenho

### Dados

O `RendererUiBackend` marca os materiais (sem mudar o que o `three` desenha):

- caixa e sombra dura: `material.userData.cortexUiBox = <PanelUniforms>`;
- imagem: `material.userData.cortexUiImage = { uniforms: <ImageUniforms>, texture }`;
- texto e `<canvas>`: `MeshBasicMaterial` com `map` (sem marca: lidos de `color`, `opacity`, `map`).

Material sem marca e sem `map` é ignorado e contado (`skipped` no relatório).

### Desenhista (`src/render/native/ui/`)

- `uiQuads.ts` (puro, testável sem GPU): percorre os filhos visíveis da cena da UI, ordena como o `three`
  ordena transparentes (`renderOrder`, depois `id`; o `z` é o mesmo para todos), escreve um registro por
  malha num `Float32Array` reaproveitado e agrupa em lotes de mesma textura consecutiva.
- Registro (`UI_QUAD_FLOATS` = 40 floats, 160 B; 10 atributos `float32x4` por instância): matriz de mundo
  da malha (4 colunas), `size.xy` + raio + espessura da borda, cor de cima + alpha, cor de baixo + alpha,
  cor da borda + alpha, eixo do gradiente + opacidade de preenchimento + opacidade do material + tipo,
  `repeat.xy` + `offset.xy` da UV.
- `uiWgsl.ts`: vertex shader que monta o canto do quad (`vertex_index`, `PlaneGeometry(1, 1)`: posição
  ±0,5 e UV com v = 1 em cima) e calcula `projeção × (vista × mundo) × posição` como o `three`; fragment
  com os três tipos, fórmulas copiadas do WGSL gerado pelo `three` 0.184 (`renderer-r0/wgsl/*/wgsl-0001`
  caixa, `wgsl-0002` texto):
  - **caixa** (0): SDF do retângulo arredondado, gradiente vertical/horizontal, borda por `smoothstep`,
    alpha × `fillOpacity`, depois × `opacity` do material;
  - **textura tingida** (1, texto e `<canvas>`): `vec4(cor, 1) × amostra`, alpha × `opacity`;
  - **imagem** (2): `vec4(amostra.rgb, amostra.a × máscara SDF × opacidade)`, depois × `opacity` do material;
  - saída `max(cor, 0)`, blend premultiplicado na RT (`src-alpha`/`one-minus-src-alpha` na cor, `one`/
    `one-minus-src-alpha` no alpha), igual ao `setUiCompositeBlend`.
- `NativeUiRenderer.ts`: dono da RT `rgba16float` (recriada no redimensionamento, a antiga destruída 2
  quadros depois), do pipeline único, do buffer de instâncias (cresce em dobro), dos grupos de textura (um
  por textura GPU, refeito quando a textura GPU muda) e do encoder do quadro: um `beginRenderPass` com clear
  transparente, `setVertexBuffer(0, quads, início do lote × 160)` + `setBindGroup` da textura + `draw(6,
  n)` por lote, um `submit`. Devolve a textura da RT para o `__cortexUiLayer`.

### Fachada e interruptores

- `Renderer.renderUiLayer`: com `?nativeUi=1` no host (compositor presente), desenha pelo
  `NativeUiRenderer`; com `?nativeUi=0` (padrão até o aceite), pelo `three`, como hoje.
- `?parityTarget=ui`: no `?parityFreeze`, os quadros congelados alternam **só a UI** entre o nativo e o
  `three` (`mainPassArm.uiThree`); o quadro 3D fica igual nos dois braços.
- `?nativeUiTint=1`: soma 8/255 ao vermelho de tudo que o desenhista nativo pinta (a resposta conhecida
  da paridade: tem de dar FAIL).
- Relatório `debug('perf')` a cada 600 quadros: `[nativeUi] quads=<n> draws=<n> skipped=<n>`.

## Testes

- Vitest (`tests/render/native/ui/`): `uiQuads` (ordem, lotes por textura, campos do registro de cada
  tipo, invisível fora, material sem marca contado); `NativeUiRenderer` com o device falso (um pass, um
  draw por lote com o offset certo, RT recriada no tamanho novo, textura só sobe quando a versão muda);
  `RendererUiBackend` marca os materiais; `ParityFreeze` alterna `uiThree` com `parityTarget=ui`.
- Paridade: `check-stage.sh` com `--flag '&nativeUi=1&parityTarget=ui'` nos pontos do jogo (dia e noite) →
  PASS; com `&nativeUiTint=1` → FAIL. Cobre os tipos que o HUD congelado mostra (caixa, texto, `<canvas>`
  do radar).

## Critério de aceite do R2.1

- Paridade da UI PASS (`?parityTarget=ui`, Setor O e Comercial, dia e noite); tint FAIL.
- A/B intercalado no mesmo export (`&nativeUi=0` × `&nativeUi=1`), 2 réplicas, 4 pontos `walk` + `drive`
  no Centro, 1080p: `ui` **não piora** (meta: cair); render, `> 33 ms` e GPU dentro do ruído; nenhum erro no
  `error_log.txt`.

## O que falta para o critério (1) do R2 (o `WebGPURenderer` não é instanciado)

Levantado na leitura do código (2026-10-26). Com a UI no nativo, o `WebGPURenderer` ainda é dono de:

| peça | onde | o que o renderer próprio precisaria |
| --- | --- | --- |
| device, contexto do canvas, tamanho/`pixelRatio` | `src/core/Renderer.ts` (construtor) | `navigator.gpu` + `canvas.getContext('webgpu')` do shim, direto |
| pass da cena: limpa, alvo `rgba16float` + profundidade, `beginRender`/`finishRender` | `three` (`Renderer.render`) | encoder e pass próprios por quadro |
| lista e ordem do quadro (RS1 dentro da `RenderList` do `three`, projeção C++ como fonte) | `src/render/RenderServer.ts`, `CleanDrawFastPath.ts`, `NativeMainProjection.ts` (internos do `three`) | lista própria: candidatos do cull C++, `painterSortStable`/`reversePainterSortStable` reproduzidos, emissão em blocos |
| saída: ACES + exposição + sRGB para o canvas (`_renderOutput`, quad do Output Color Transform) | `three` | passe de saída em WGSL (fórmula do `three`), ou a cena em HDR para o composite do host |
| upload de textura (KTX2 com mips, canvas 2D, `DataTexture`, imagem, geração de mipmap) e sampler | `three` (`_textures`), usado pelo `NativeRenderer` e pela UI | upload próprio pelo shim |
| contexto de render dos pipelines (formatos, amostras) | `recipeFor(entry, renderContext)` | formatos fixos do pass próprio |
| aquecimento (`compileAsync`, `drawWithParallelPipelines`) | `Game.precompile`, `WarmupFrame.ts` | só `NativeRenderer.precompile` |
| instrumentos que leem o `three` (`info`, `backend`, censo, fases, `writeBuffer`, `pipelinesBorn`) | `Game.ts`, `PerfTrace.ts` | guardar por `null` ou ler do nativo |
| KTX2 (`setKtx2Renderer` → `detectSupport`) | `src/core/loadKtx2.ts` | suporte fixo do host |
| **no jogo:** sombra do sol (`new SunShadow(game.renderer.threeRenderer, sun)`) e `waitGpuIdle(threeRenderer)` | `main.ts:512`, `main.ts:2796` do DDD 61 | API da engine sem o `three` (spec no jogo + re-vendor) |

É o "dono da pass" que a SPEC-0585 (P2, passo 2) deixou para depois, somado ao R4 parcial (o `three` deixa
de ser o renderer, mas continua no bundle). Dá vários dias, mexe no caminho que o R1 provou e precisa de
paridade a cada passo. **Fica para decisão do usuário/coordenação** depois da medição do R2.1 (ver o
relatório desta etapa no PRD-0466).
