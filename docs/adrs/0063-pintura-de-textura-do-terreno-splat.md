# 0063 - Pintura de textura do terreno (splat) com pincel no editor

**Data:** 2026-06-12
**Status:** aceito

## Contexto

O terreno esculpível (ADR-0059) tinha cor única (`MeshStandardMaterial` verde) e o
T4 "pintura de textura/splat" estava pendente. O usuário quis, estilo Unity:
alternar o pincel entre **esculpir** (altura) e **texturizar** (pintar textura),
escolher a textura, **importar** uma imagem pra dentro do projeto e escolher entre
as texturas disponíveis no projeto.

## Decisão

**Engine (`src/scene/Terrain.ts`)** — splatmap clássico:

- Até **4 camadas** de textura (`TERRAIN_MAX_LAYERS`), uma por canal RGBA de um
  **splatmap** (`DataTexture` 256², `Uint8Array` de pesos). `layerFor(url)` aloca/
  reusa camada; cada camada tem `repeat` (tiling ao longo do terreno).
- **`paint(localX, localZ, radius, amount, layer)`**: soma `amount` (0..1; negativo
  apaga) ao peso da camada num círculo, com o mesmo falloff smoothstep do `sculpt`.
  Quando a soma dos canais estoura 255, as outras camadas são reduzidas
  proporcionalmente (pintar por cima substitui; onde nada foi pintado a **cor base**
  aparece).
- **Shader**: blend em **TSL/NodeMaterial** — ao ligar a pintura o material vira um
  `MeshStandardNodeMaterial` com `colorNode = mix(corBase, blendDasCamadas, soma)`.
  **Por quê:** o engine renderiza com `WebGPURenderer` (node-based), onde
  `material.onBeforeCompile` é **silenciosamente ignorado** (a 1ª implementação usou
  onBeforeCompile: funcionava no WebGLRenderer clássico e não no engine — nada de
  erro, só a textura não aparecia). Iluminação/sombras do material padrão continuam
  valendo. Nós estáveis (texture/uniform): trocar textura/tiling só troca `.value`,
  sem reconstruir o material.
- **`getPaint()/setPaint()`**: serialização (camadas + splatmap em **base64**).

**Persistência** — overlay `data.terrainPaint[id] = { layers, size, splat }`
(reader `overlayTerrainPaint` no `SceneBuilder`), separado de `data.terrain[id]`
(heightmap, formato preservado). O `buildScene` reaplica no boot.

**Editor** — o pincel ganhou **modo** (`TerrainBrushMode`: `sculpt` | `paint`) na
`TerrainAuthoring`/`TerrainApi`. No Inspector (seção Terreno): select "Modo"
(Esculpir/Texturizar); em Texturizar, select "Textura" (imagens do projeto), botão
"Importar textura…" e "Repetição" (tiling). SHIFT inverte (abaixa/apaga). O anel do
pincel muda de cor por modo (amarelo esculpe, azul pinta).

**Importação de textura** — novo field kind **`file`** no `InspectorModel`: cada
renderizador (in-canvas `EditorModelDom`; IDE `EditorPanels`) abre o file picker
**no próprio frame** (o clique do usuário acontece lá — abrir via postMessage no
iframe do engine seria bloqueado por falta de *user activation*) e entrega
`{ name, dataUrl }` como string JSON pro handler. O handler sobe o arquivo via novo
endpoint **POST `/__upload-asset?name=…`** do `createSceneSavePlugin` (grava em
`assets/textures/`, só extensões de imagem, basename sanitizado) e a textura entra
na lista. O `createAssetListPlugin` passou a listar também imagens
(`.png/.jpg/.jpeg/.webp`) — o `attachEditor` filtra `.glb` pro painel Add e imagens
pro pincel.

## Consequências

- Terreno com visual real (grama/terra/pedra…) editável 100% no editor, persistido
  na overlay e restaurado no boot — mesmo fluxo do heightmap.
- Splatmap 256² em base64 ≈ 350 KB por terreno pintado no `scene-data.json` —
  aceitável; otimizar (PNG/compressão) se virar atrito.
- Limite de 4 texturas por terreno (1 canal por camada). Toast avisa quando cheio.
- Selects com **opções dinâmicas** agora entram na chave de estrutura dos dois
  renderizadores (sem isso, a textura recém-importada não aparecia na lista).
- Trocar o **Shader** (ADR-0058) do objeto-terreno substitui o material e perde o
  blend de splat — limitação conhecida (não combine os dois no terreno).
- Importação exige o dev server (endpoints do plugin Vite) — em produção não há
  editor; projetos vendoriados precisam **re-vendorizar** o engine pra ganhar os
  endpoints novos.

Substitui o item "pendente: pintura de textura/splat" do ADR-0059.
