# 0059 - Terreno heightmap esculpível (estilo Unity)

**Data:** 2026-06-10
**Status:** aceito (T1 engine mesh/heightmap/sculpt + T2 ferramenta de esculpir no editor + T3 colisão sólida; pendente: pintura de textura/splat)

## Contexto

O usuário quis construir terreno "igual à Unity": criar um plano e **esculpir a
altura** por cima com pincel (raise/lower). O engine não tinha terreno 3D — só o
`heightfield` 2D (perfil lateral do platformer) e `Tilemap`. Pra jogos top-down/3D
(que ganharam a `TopDownCameraSystem`, ADR sem número/feat), faltava um terreno
horizontal com heightmap.

## Decisão

`src/scene/Terrain.ts` — **terreno horizontal heightmap**:

- **Mesh**: plano no chão (XZ) subdividido numa grade `(resolution+1)²`, com a
  altura (Y) por vértice vinda de um `Float32Array` (o heightmap). UVs lineares,
  normais recalculadas.
- **`sculpt(localX, localZ, radius, delta)`**: soma `delta` à altura num círculo de
  `radius` (coords locais XZ), com **falloff smoothstep** (cheio no centro → 0 na
  borda). `delta>0` levanta, `<0` abaixa. Recalcula normais. É o núcleo do pincel
  raise/lower (a v1 escolhida).
- **`getHeights()/setHeights()`**: heightmap serializável (row-major) — persistência.
- **Nó `terrain`** na `SceneDefinition` (`size`, `resolution`, `heights?`, `color`),
  instanciado pelo `buildScene`. O controlador `Terrain` fica em
  `mesh.userData.cortexTerrain` (o editor esculpe por ali). Heightmap autorado no
  editor persiste em `overlay.data.terrain[id]` (reader `overlayTerrain`), que vence
  o `heights` do nó.

## Consequências

- Base pra jogos top-down/3D com relevo (colinas, vales). O sculpt é puro CPU
  (mexe no heightmap + normais) — ok pra resoluções modestas (default 64).
- **Limitações (T1):**
  - Só **raise/lower** (a v1 pedida). Smooth/flatten/set-height e pintura de
    textura/brushes ficam pra fases futuras.
  - **Sem collider** ainda — o terreno é visual; colisão 3D/heightfield vem depois.
  - Heightmap persistido como `number[]` no overlay (JSON) — bulky em resoluções
    altas; otimizar (Float32/base64) se virar atrito.
  - A **ferramenta de esculpir no editor** (raycast + pincel + UI tamanho/força)
    é a fatia T2 (este ADR cobre a fundação T1 do engine).
