# 0051 - Camada 2D / pixel art (ortográfica, sprite, spritesheet, tilemap)

**Data:** 2026-06-07
**Status:** aceito

## Contexto

A engine era 2.5D/3D-mesh (GLB, câmera perspectiva, PBR). O usuário quis fazer
**jogos pixel art 2D**. A base (ECS, física de plataforma 2D, three/WebGPU,
editor) serve, mas faltavam as peças de render 2D: câmera ortográfica, sprites
nítidos (nearest filter), animação por spritesheet e tilemap.

## Decisão

Camada 2D **aditiva** (não muda nada do 3D):

1. **Câmera ortográfica no `Game`:** `GameOptions.projection: 'orthographic'` +
   `pixelsPerUnit`. `Game.camera` vira `PerspectiveCamera | OrthographicCamera`; o
   frustum ortográfico é derivado de `pixelsPerUnit` (unidades de mundo ↔ px de
   tela) e reajustado no resize. O editor (câmera livre) segue perspectiva.

2. **Nearest filter:** `AssetLoader.loadTexture(url, { pixelated: true })` e o
   helper `pixelate(texture)` (magFilter/minFilter = Nearest, sem mipmaps).
   `NearestFilter`/`LinearFilter` re-exportados no `index-runtime`.

3. **Sprite:** `createSprite(texture, opts)` — quad (`PlaneGeometry`) com
   `MeshBasicMaterial` **unlit** (sem tonemap), transparente, dimensionado em
   unidades de mundo (de `px/pixelsPerUnit` ou explícito). Encaixa numa entidade
   ECS via `Object3DComponent` como qualquer mesh.

4. **Spritesheet + animação:** `Spritesheet` (grade de frames; `applyFrame`
   recorta UV com V invertido = índice 0 no topo-esquerda). `createAnimatedSprite`
   devolve o mesh (textura **clonada** por sprite) + um `SpriteAnimationComponent`
   (animações nomeadas: frames + fps + loop). O `SpriteAnimationSystem` avança os
   frames; troca com `component.play('run')`.

5. **Tilemap:** `buildTilemap({ tileset, tileWidth/Height, data, tileSize })` —
   **um único Mesh** (geometria mesclada, cada célula um quad com UV no tileset).
   `tilemap.addColliders(world, isSolid?)` cria colliders box mesclando runs
   horizontais por linha (menos entidades).

## Consequências

- Dá pra montar um **plataformer pixel** usando a física 2D atual (Collider2D,
  PlatformerPhysics, input, FollowCamera2D) + sprites/tilemap, com câmera
  ortográfica e pixels nítidos.
- **Zero impacto no 3D/2.5D:** `projection` default segue perspectiva; a união do
  tipo da câmera só exigiu alargar `EditorCameraSystem.gameCamera` e o aspect do
  editor.
- Pixel-perfect "duro" (sem shimmer ao mover sub-pixel) exige `pixelsPerUnit`
  casando com a resolução do sprite + possivelmente snap de posição — a base
  (ortho + nearest) já dá nitidez; refinamento fica a cargo do jogo.
- Sem tilemap com camadas/auto-tiling nem editor visual de tiles ainda — `data` é
  autorado em código/JSON (evolução natural: importar Tiled/LDtk, editor de tiles).
- Relaciona-se com ADR-0001 (three), 0032 (WebGPU), 0045 (física 2D), 0050 (boot
  em edição — o editor funciona igual em projeto 2D).
