# SPEC-0068 - Personagem modular (esqueleto compartilhado)

**Data:** 2026-06-15
**Status:** aceito

## Contexto

Jogos precisam de **criador de personagem** (escolher corpo/pele, rosto, cabelo, roupa
e misturar livremente). Pré-assar cada combinação num `.glb` não escala (explode em
nº de arquivos). O engine já carrega `.glb` skinado e anima (`SceneAnimator` +
`AnimationMixer`), mas não tinha como **compor um personagem de várias peças que
compartilham um esqueleto** em runtime.

Detalhe que define o desenho: o exportador glTF inclui em cada peça **só os ossos que
ela usa** (`skin.joints` varia — cabelo não referencia ossos da perna). No nosso kit,
o rig tem 59 ossos e cada peça usa um subconjunto de 44. Então **rebind por índice não
funciona** (o `skinIndex` de cada peça indexa o esqueleto dela, não o do rig).

## Decisão

Novo `src/scene/ModularCharacter.ts`:
- `composeModularCharacter(rig: GLTF, parts: GLTF[]): { object, animator }`
- `loadModularCharacter(rigUrl, partUrls[])` (carrega por URL com o cache do `loadGLB`).

Algoritmo: clona o rig (`SkeletonUtils.clone`), monta um mapa **nome→osso** dos ossos
do rig, e **descarta o mesh próprio do rig** (só queremos esqueleto + animações). Pra
cada peça: clona, e pra cada `SkinnedMesh` remapeia `mesh.skeleton.bones` pros ossos do
rig **por nome** (preservando a ordem da peça), cria `new Skeleton(ossosRemapeados,
mesh.skeleton.boneInverses)`, `mesh.bind(...)`, `frustumCulled=false` e reparenta sob a
raiz do rig. O `SceneAnimator(raizDoRig, rig.animations)` move os **ossos**; como cada
peça está bindada nesses ossos, todas deformam juntas.

**Por que é correto:** casar por nome preserva o mapeamento `skinIndex → osso`. Os
`boneInverses` da peça valem nos ossos do rig porque ambos compartilham a **pose de
descanso** (mesmo esqueleto de origem). O `AnimationMixer` não precisa que os meshes
estejam nos clipes — ele dirige os ossos (por nome de nó); os meshes seguem por estarem
bindados neles.

**Pipeline de peças (offline, fora do engine):** um `rig.glb` (esqueleto + animações;
o mesh base é descartado em runtime) e um `.glb` por peça (esqueleto em bind pose + 1
mesh, **sem clips** → arquivos pequenos), todas exportadas do mesmo esqueleto.

## Consequências

- Criador de personagem com **mistura livre** sem explosão de combinações: o custo é
  nº de peças, não de combinações. Carregar uma combinação = `loadGLB` (cacheado) +
  clone + rebind (barato).
- **Pré-requisito:** todo osso de cada peça tem que existir no rig (mesmo esqueleto).
  O helper **lança erro** com o nome do osso se faltar (pega cedo um pipeline errado).
- A composição é **game-side de tick**: o personagem composto não passa pelo
  `builtScene.update(dt)`; quem usa chama `animator.update(dt)` no loop.
- Material: cada peça carrega o próprio material/atlas (o helper não reatribui). Mesh-
  por-peça (sem merge de geometria) é o que permite a troca por peça.
- API pública nova → regerar doc (`yarn docs:engine`) e re-vendorizar (ADR-0009).
