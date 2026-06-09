# 0057 - Nó `sprite` 2D data-driven na cena

**Data:** 2026-06-09
**Status:** aceito

## Contexto

O engine tinha runtime 2D completo — `Sprite`/`Spritesheet`, `createAnimatedSprite`,
`SpriteAnimationComponent` + `SpriteAnimationSystem`, `Tilemap` — mas **só acessível
por código imperativo**. A cena data-driven (`SceneDefinition` → `buildScene`, ADR-0046)
não tinha nó de sprite: os `type`s eram `model` (.glb), `primitive`, `light`, `water`
e `background` (backdrop parallax estático). Resultado: a IA level-designer e os
**kits** (ADR-0053) só sabiam montar cena com modelos 3D `.glb` — assets 2D (pixel art,
spritesheets de personagem) não tinham como ser **colocados numa cena** declarativamente,
mesmo o engine sabendo desenhá-los.

Isso bloqueava trazer kits 2D pro fluxo de kits: um `kit.json` 2D seria um catálogo
que ninguém instancia (ao contrário dos kits 3D, instanciados via nó `model`).

## Decisão

Adicionado o nó **`sprite`** à `SceneDefinition` (discriminated union) e seu
tratamento no `buildScene`:

- **Schema** (`src/scene/SceneDefinition.ts`): `{ type: 'sprite', url, frameWidth?,
  frameHeight?, columns?, rows?, animations?, initial?, pixelsPerUnit?, width?,
  height?, pixelated?, alphaTest?, id, transform?, place? }`. A grade de frames vem
  de `frameWidth/frameHeight` **ou** de `columns/rows` (derivado do tamanho da
  textura). `animations` é `{ nome: { frames: number[], fps?, loop? } }`.
- **Instanciação** (`src/scene/SceneBuilder.ts`, helper `makeSprite`): sem
  `animations` → `createSprite` (quad unlit estático); com `animations` →
  `Spritesheet` + `createAnimatedSprite`. O `SpriteAnimationComponent` fica em
  `userData.cortexSpriteAnim`.
- **ECS** (passo 3 do `buildScene`, quando há `options.world`): o sprite animado
  ganha uma entidade com `Object3DComponent` + o `SpriteAnimationComponent`, e o
  `SpriteAnimationSystem` é ligado **sob demanda, uma vez só** (novo
  `World.hasSystem(SystemClass)`).
- **Loader** (`src/scene/SceneAssets.ts`): novo `loadTexture(url, pixelated?)` com
  cache por URL (espelha o `loadGLB`).

## Consequências

- A cena data-driven agora coloca sprites 2D estáticos e animados — base pra kits
  2D (ADR-0053 estendido) e pra a IA montar cenas pixel art.
- **Limitações conhecidas (escopo desta fatia):**
  - Sprite animado precisa de `options.world` pra animar (sem world = quadro
    estático), igual ao caso de água adicionada ao vivo. `addSceneNode` (live-add
    do editor) cria o mesh mas não liga a animação até recarregar.
  - `collider`/`player` **não** são suportados no nó `sprite` ainda (o passo de
    collider/player cobre só `model`/`primitive`). Personagem-sprite jogável e
    colisão 2D por sprite ficam pra uma fase futura.
  - Sprite animado é sempre **pixelated** (nearest) — `pixelated: false` só afeta o
    estático. Kits 2D são pixel art, então é o default desejado.
  - Cada animação assume **uma** spritesheet (uma textura). Animações em arquivos
    separados (ex.: idle/run/walk como PNGs distintos) devem ser empacotadas numa
    folha única no preparo do kit (skill `process-asset-kit-2d`).
- Relaciona-se com ADR-0053 (design system de kits): a Fase seguinte estende o
  `kit.json` com framedata 2D pra o nó `sprite` herdar grade/animações do kit.
