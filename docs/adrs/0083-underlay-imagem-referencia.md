# 0083 - Underlay: imagem de referência pra blockout

**Data:** 2026-06-28
**Status:** aceito

## Contexto

Pra desenhar blockouts (ProBuilder, estradas, posicionar objetos) batendo com um mapa/
planta, faltava uma **imagem de referência no chão** ("blueprint"), tipo o background image
do Blender/Unity. O usuário quer largar uma imagem no terreno e criar por cima.

## Decisão

- Novo nó de cena **`underlay`** (`SceneDefinition`): plano texturizado deitado no XZ.
  Campos: `image`, `size` (m), `opacity`, `height` (acima do chão), + transform.
- `buildScene`/`makeUnderlay`: cria um `Group` com um `Mesh(PlaneGeometry)` rotacionado
  pra o chão, `MeshBasicMaterial` (transparente, `toneMapped:false` pra a cor sair fiel,
  `depthWrite:false`), `renderOrder -1`, **`raycast` desligado** (clica ATRAVÉS → dá pra
  posicionar blockouts por cima). `userData.cortexUnderlay` = o mesh.
- Inspector **seção "Underlay"** (`UnderlayApi`/`UnderlayAuthoring`): importar imagem
  (FileField → upload `/__upload-asset`), opacidade e altura — **tudo ao vivo**
  ([[inspector-live-realtime]]). Posição/escala/rotação pelo gizmo (nó normal).
- Persiste em `data.underlay[id]` (overlay); `buildScene` reaplica no reload
  (`overlayUnderlay`).

## Consequências

- Adicionar pela UI precisa de um botão na IDE (app à parte) mandando `addUnderlay` — por
  ora o nó é pré-criado no `level.json` (id `underlay-ref`) ou adicionado via Chat IA; a
  fiação `onAddUnderlay`/bridge fica pra quando a IDE tiver o botão.
- É aid de autoria; o usuário deleta quando o blockout estiver pronto (ou esconde).
