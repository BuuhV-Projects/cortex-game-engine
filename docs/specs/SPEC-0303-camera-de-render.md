# SPEC-0303 - `game.renderCamera`: a câmera que está desenhando

**Data:** 2026-10-05
**Status:** aceito

## Contexto

No editor (F2) a engine desenha com uma câmera livre própria (`editorCamera`,
criada no `attachEditor`) e desliga a neblina; a `game.camera` fica parada onde o
player está. Jogo com corte por distância (Detetive Brasília, SPEC-0041 do jogo)
cortava pela `game.camera`: no editor, tudo longe do player sumia — o usuário
navegava até o Centro e via só prédios soltos no chão vermelho. Não havia jeito
público de saber qual câmera está desenhando (`_editor.activeCamera()` é privado).

## Decisão

- `Game.renderCamera` (getter): a câmera do editor quando ele está ativo, senão a
  câmera ativa do jogo. A escolha é a função pura `pickRenderCamera(editor, camera)`
  (testável sem WebGPU).
- Lógica que depende do que está na tela (corte por distância, LOD) usa
  `renderCamera`; lógica de jogo (seguir o player, mira) continua com `camera`.

## Consequências

- No editor, o jogo corta pela câmera de edição; no play, pela do jogo.
- A câmera de inspeção (`game.inspect`) não entra: ela não é usada pra edição.
