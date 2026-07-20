# SPEC-0093 - Picker "Adicionar modelo (.glb)" no blockout (modal com busca)

**Data:** 2026-07-04
**Status:** aceito

## Contexto

O blockout (SPEC-0071) só oferecia primitivas paramétricas; colocar uma peça REAL
de kit exigia arrastar da árvore de arquivos (SPEC-0090) — bom pra 1 peça, lento
pra construir level design em série (achar o arquivo na árvore a cada vez). O
usuário pediu: escolher qual `.glb` usar direto do fluxo de blockout, com um
modal de lista + busca.

## Decisão

Reusar o **`EditorTexturePicker`** (modal de grade com busca, que já serve
texturas de terreno e modelos de vegetação — e vive **no frame do jogo**, então
funciona igual no standalone e no Studio bridged):

- **`openModelPicker()`** no `attachEditor`: lista TODOS os `.glb` do projeto
  (do `/__list-assets`, já buscado pro painel Add), thumb genérico (cubo SVG
  inline — projetos não têm thumbnails de modelo), busca por nome; escolher
  adiciona à frente da câmera pelo MESMO fluxo do painel Add (`addModelNode`:
  persiste em `data.added`, seleciona, CTRL+Z).
- **Gatilhos**: botão "📦 Modelo (.glb)…" na paleta de Formas (standalone);
  menu **Cena → Adicionar modelo (.glb)…** no Studio (evento `request-add-model`
  → ponte `openModelPicker` → modal abre no iframe).
- Rename cosmético junto: "Desenhar caixa no chão" → **"Desenhar blockout"**
  (menu e paleta).

## Adendos (mesmo dia)

- **Thumbnails 3D reais** (`ModelThumbs.ts`): cada card renderiza o `.glb` numa
  miniatura de 96px — `WebGPURenderer` próprio com `forceWebGL: true` (o bundle
  aliasa `three` pro build WebGPU, sem `WebGLRenderer` clássico), cache por URL,
  fila serial, e carregamento **lazy** (IntersectionObserver no
  `EditorTexturePicker` via `TextureItem.loadThumb`) — só renderiza cards
  visíveis.
- **"Desenhar blockout" com modelo MOLDADO** (iterado com o usuário — a 1ª
  versão "carimbo por clique" criava na hora e quebrava o gesto de desenho): o
  botão/menu abre o picker com "Caixa (padrão)" OU um `.glb`; escolhido o
  modelo, o **mesmo gesto** (CTRL+arraste a base → puxa a altura → clique) vale,
  e o `.glb` **se molda à caixa desenhada** — `ShapeDrawSystem.setModel(url)` +
  `fitModelToBox` (pura, testada): escala por eixo, base do bbox no chão,
  centrado em X/Z. O **preview do próprio modelo escala AO VIVO** durante o
  arrasto (a caixa translúcida vira guia sutil); o preview é `editorInternal`
  (o raycast do chão o ignora — senão a base "sobe" nele). Confirmar cria um nó
  `model` com `transform.position/scale`.

## Consequências

- Level design em série: escolher a peça UMA vez e carimbar N cópias clicando —
  complementa o drag-and-drop (preciso posicional) e o picker de adicionar
  (peça única).
- A ponte ganhou a mensagem `openModelPicker` (o modal em si NÃO é replicado na
  IDE — abre in-canvas, uma implementação só).
