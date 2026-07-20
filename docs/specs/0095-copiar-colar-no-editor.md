# SPEC-0095 - Copiar/colar objetos no editor (CTRL+C / CTRL+V)

**Data:** 2026-07-04
**Status:** aceito

## Contexto

Duplicar um objeto no editor exigia re-adicionar pelo picker/drag-and-drop e
re-ajustar transform/autorias na mão — lento pra level design (o caso real:
espalhar cópias de um .glb ajustado no teste4). Faltava o fluxo padrão de
DCC/engine: selecionar → CTRL+C → CTRL+V.

## Decisão

- **`SceneBuilder.makeNode`** passa a guardar o **def do nó** em
  `userData.cortexNodeDef` (referência, custo zero). É o que permite copiar
  QUALQUER nó — vindo do código/JSON ou adicionado no editor — sem manter um
  índice paralelo `nome → def`.
- **`src/editor/clipboardNode.ts`** (puro, testado): `buildPastedNode(clip, id)`
  monta o nó da cópia — id novo, `transform` explícito (posição do original
  deslocada `PASTE_OFFSET`=1 em X/Z + rotação/escala ATUAIS do Object3D, não as
  do def), sem `place`, e **sem os singletons de gameplay** `player`/`character`
  (duplicar o controller quebraria o jogo); scripts/collider/animation vão junto.
- **`attachEditor`**: CTRL+C captura def clonado + transform do selecionado
  (sobe até o nó `cortexSceneNode` se a seleção for um filho); CTRL+V cria a
  cópia pelo MESMO caminho do drag-and-drop — `addSceneNode` + `data.added` +
  `persist` + seleciona + `pushAddCommand` (CTRL+Z desfaz). Autorias do
  original registradas por nome no overlay (physics, scripts, material,
  shadow…) são clonadas pro nome novo. CTRL+V repetido "escada" (cada cópia
  parte da anterior). Atalhos no listener existente do undo (só no modo
  editor, fora de campos de texto; CTRL+C com texto selecionado na página não
  é roubado).
- **Escopo v1: só nós `model` (.glb)** — o pedido do usuário. Outros tipos
  (primitive/mesh/light) dão toast explicando.

## Consequências

- Colar instancia **só o visual** ao vivo (mesma regra do drag-and-drop,
  `addSceneNode` não cria ECS): scripts/física do def da cópia valem no
  próximo Play/reload, quando o `buildScene` lê `data.added`.
- `CONCERN_KEYS` ganhou `'shadow'` (faltava — delete não limpava o registro
  de sombra; a cópia e a limpeza agora cobrem).
- `userData.cortexNodeDef` é uma referência viva ao def (não clone) — quem
  copiar precisa clonar (o CTRL+C clona via `cloneJson`).
- Extensão futura natural: permitir `primitive`/`mesh` (mesmo fluxo), e
  CTRL+D (duplicar direto) como atalho composto.
