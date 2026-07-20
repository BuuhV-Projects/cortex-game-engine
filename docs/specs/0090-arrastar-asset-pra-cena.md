# SPEC-0090 - Arrastar asset pra cena (DnD do FileTree/painel Add → viewport)

**Data:** 2026-07-02
**Status:** aceito

## Contexto

Colocar um modelo na cena no modo edição era limitado: o painel "Add" do editor
standalone adiciona por **clique** (o modelo nasce num ponto fixo à frente da
câmera, em y=0) e, **dentro do Studio, esse painel nem aparece** — os painéis
in-canvas viram chrome da IDE (ADR-0056) e a ponte só expunha
`addTerrain`/`addShape`/`addVegetation`. Ou seja: no Studio não havia forma de
escolher um asset e colocá-lo na cena; no standalone, o modelo caía longe de onde
o usuário queria e exigia mover com gizmo depois.

## Decisão

**Arrastar-e-soltar com o POSICIONAMENTO sempre no engine**, mas com **duas rotas
de captura do drop** conforme o host:

- **Standalone (browser):** DnD nativo — `dragover`/`drop` no canvas do editor.
- **Studio (Electron):** o Electron **não entrega** eventos de DnD através da
  fronteira do iframe do Preview (o drop mostra 🚫 — descoberto no teste real).
  Então, durante o drag de um asset, o Preview arma um **overlay transparente
  sobre o palco** que captura o drop no documento da IDE e repassa
  `{ url, nx, ny }` (posição normalizada) pela **ponte postMessage**
  (`dropAsset`, ADR-0056) — o engine converte pra NDC e usa o MESMO fluxo de
  posicionamento.

- **`src/editor/assetDrop.ts`** (lógica pura, testável): MIME próprio
  `application/x-cortex-asset` (payload = URL relativa ao projeto), extração da
  URL do `DataTransfer` (rejeita caminho absoluto — é o drag de mover-arquivo da
  IDE), NDC do ponto do drop e **`worldDropPoint`**: raycast da câmera do editor
  pelo cursor contra a cena (ignorando chrome `editorInternal`) → o modelo nasce
  **na geometria sob o mouse** (plataforma/terreno); fallback plano y=0; fallback
  12 unidades à frente da câmera.
- **`attachEditor`**: `dragover`/`drop` no canvas quando o editor está ativo;
  fluxo de add unificado (`addModelNode`) — mesmo caminho do clique: persiste em
  `overlay.data.added`, seleciona e registra no CTRL+Z (SPEC-0084).
- **Origens do drag**: itens do painel Add (standalone) e a **árvore de arquivos
  do Studio** (`FileTree`) — que já era draggable pra mover arquivo; agora um
  `.glb`/`.gltf` também carrega o MIME de asset com o caminho relativo ao projeto
  E anuncia o drag (`asset-drag` no documento) pra o Preview armar o overlay.
  A árvore É o browser de assets do Studio (não foi criado dock novo).
- **Fluxo no Studio**: `FileTree` (dragstart) → evento `asset-drag` → `Preview`
  arma o overlay → drop → evento `request-drop-asset` → `EditorPanels` →
  postMessage `dropAsset` → `EditorBridge` → `attachEditor.onDropAsset` →
  `worldDropPoint` + `addModelNode` (persist/seleção/CTRL+Z).

## Consequências

- No Studio: arrastar um `.glb` da árvore → soltar no viewport coloca o modelo
  onde o mouse aponta, com undo e persistência na overlay. Clique no painel Add
  (standalone) continua como estava.
- `text/plain` continua sendo o caminho absoluto do move-arquivo do FileTree — os
  dois drags coexistem no mesmo gesto (`copyMove`); cada alvo lê o tipo que lhe
  cabe. O drop do engine aceita `text/plain` de modelo se for **relativo** OU
  **absoluto com segmento `assets/`** (recorta dali a URL — o Vite serve a raiz do
  projeto). Isso faz o drop funcionar mesmo com um Studio antigo (sem o MIME) e
  com arrastar do Explorer, desde que o arquivo já viva em `assets/`. Absoluto
  sem `assets/` é rejeitado (não é servível).
- Limitação: sem preview/ghost do modelo durante o drag (o drop é "cego" até
  soltar). Um ghost translúcido seguindo o raycast é evolução natural.
- Limitação: só `model` (`.glb`/`.gltf`). Imagens/áudio não têm nó de cena óbvio.
