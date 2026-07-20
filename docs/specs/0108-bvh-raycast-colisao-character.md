# SPEC-0108 - BVH pra acelerar o raycast de colisão do Character

**Data:** 2026-07-08
**Status:** aceito
**Relacionado:** CharacterPhysicsSystem (colisão por raycast na geometria real)

## Contexto

O `CharacterPhysicsSystem` (character controller estilo Unity) faz a colisão
**raycastando a geometria REAL da cena** com o `Raycaster` do three: 1 raycast de
chão (pra baixo) + até 12 de parede (3 alturas × ±X/±Z) **por frame**. O `Raycaster`
testa **triângulo por triângulo** — O(nº de triângulos do mesh). Isso é barato num
tile de plataforma (~90 tris), mas **catastrófico** num prop detalhado.

**Sintoma (reportado, medido no export nativo):** ao atravessar uma **ponte de corda**
de **2008 triângulos** (marcada sólida no editor), o FPS despencava de ~60 pra **~10**
(sustentado) enquanto o personagem encostava nela, e voltava ao normal ao sair. A
medição isolou o custo na **física** (`world.tick`): `phys=75-89ms` na ponte vs `~2ms`
fora — 13 raycasts/frame × 2008 tris = ~26 mil testes de triângulo por frame, **em JS**.

Só aparecia no **export nativo (Hermes)**, não no Studio (V8): o loop de triângulos do
`Raycaster` roda ~5-10× mais lento no Hermes, então o mesmo custo que o V8 "engolia"
no orçamento de frame derrubava o Hermes. **Não era render/SSAA/água** (hipóteses
descartadas por medição ao longo da investigação); era CPU/JS puro na colisão.

## Decisão

Acelerar o raycast de colisão com **`three-mesh-bvh`** (`@0.9.10`, pinado):
constrói uma **árvore de volumes (BVH)** por geometria e troca o raycast de
O(triângulos) por **O(log n)**.

Implementação (`src/physics/raycastAccel.ts`, usado pelo `CharacterPhysicsSystem`):
- **Patch global idempotente:** `Mesh.prototype.raycast = acceleratedRaycast` +
  `BufferGeometry.prototype.computeBoundsTree`. O raycast acelerado **cai no padrão**
  quando a geometria não tem árvore → seguro pra TODO raycast do engine (editor,
  picking), sem mudar comportamento.
- **Árvore sob demanda, só quando compensa:** `ensureBoundsTree(mesh)` (chamado no
  `collectScene` do controller) constrói a BVH **uma vez** por geometria, apenas acima
  de `MIN_BVH_TRIS` (512). Tiles/itens pequenos ficam no caminho normal (montar a
  árvore custaria mais que o ganho). Malhas **skinned** (o personagem) são puladas
  (a árvore seria da pose de bind).

## Consequências

- **Ponte de 2008 tris:** `phys` na travessia caiu de **~89ms → ~2ms**; FPS de
  **~10 → ~65** no export nativo. Validado por medição (perf.log) na fase-4 do teste4.
- **Geral:** qualquer geometria detalhada (cenário Blockout, props de kit densos) fica
  barata de colidir, no Hermes inclusive — remove uma classe inteira de armadilha de
  perf ("não use mesh detalhado como colisão").
- **Correção preservada:** teste unitário trava que o raycast com BVH devolve o MESMO
  hit do padrão (acelerar não muda a colisão) — `tests/physics/raycastAccel.test.ts`.
- **Custo:** +1 dependência (`three-mesh-bvh`, JS puro, roda no Hermes — validado no
  boot do export) e um custo único de montar a árvore na 1ª vez que o prop entra na
  colisão (~ms, sob a tela de loading na prática).
- **Não resolve o "tunneling":** o raycast de chão (1 ray) ainda passa pelas **frestas**
  entre as tábuas da ponte → o personagem pode cair. É problema de geometria (colisão =
  malha detalhada com vãos), separado da perf; solução à parte (piso liso sob a ponte,
  ou colisão por proxy low-poly).
