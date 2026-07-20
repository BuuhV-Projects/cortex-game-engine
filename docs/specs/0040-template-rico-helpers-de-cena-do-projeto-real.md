# SPEC-0040 - Template rico e helpers de cena vindos de um projeto real

**Data:** 2026-06-05
**Status:** aceito

## Contexto

Continuando a montagem da "fase 1" (platformer de ilhas) num projeto real, o
usuário evoluiu, no próprio projeto, peças que se mostraram melhores/mais
ergonômicas que o que o engine oferecia, e pediu pra o template "vir com base
nesse projeto":

- Um `placeOnGround` que, além de assentar a base, **centra horizontalmente** e
  aplica `rotY`/`scale`, retornando `topY`/bordas — bem mais usável que o
  `placeOnGround(obj, groundY)` de só-Y do SPEC-0039.
- Helpers `loadGLB` (cache), `instance` (clone + sombras nos meshes) e `scatter`.
- Uma água v2: a textura de cáusticas como **emissiveMap** (acende a água) com
  fluxo animado em dois eixos e `receiveShadow`.
- Um setup de **iluminação exterior** "verão" (tone mapping ACES + soft shadows +
  sol com shadow-camera + hemisphere + ambient) — que cru exigia castar
  `renderer.threeRenderer` e `sun.shadow` pra `unknown`.

Também surgiu a necessidade de **desligar sombra por objeto** (ex.: água, decals,
props), sem afetar a cena toda.

## Decisão

1. **`SceneAssets.ts`** (substitui o `Placement.ts` do SPEC-0039): `loadGLB`,
   `instance(gltf, { castShadow?, receiveShadow? })`, `setShadows(obj, opts)`,
   `placeOnGround(obj, { x, y, z, rotY, scale })` → `Bounds`, `getWorldBounds`,
   `scatter`. Resolve a ressalva de sombra-por-objeto via `instance(...,
   { castShadow: false })` ou `setShadows(obj, ...)` (atua nos meshes do objeto,
   serve pra ECS e não-ECS).

2. **`OutdoorLighting.ts`**: `setupOutdoorLighting(renderer, scene, options)`
   encapsula tone mapping + shadowMap + sol/hemisphere/ambient e devolve as luzes
   pra ajuste. Expõe o que antes só dava pra setar com cast. Constantes de shadow
   map (`PCFSoftShadowMap`, etc.) também re-exportadas.

3. **`Water` v2**: `emissiveMap` (em vez de `map`), `causticsIntensity`, fluxo
   `[x, y]` em dois eixos, `receiveShadow`.

4. **Template enriquecido** (`templates/new-project/main.ts`): a cena starter
   passou de "chão cinza + cubo" pra **água + ilha + cubo apoiado**, iluminada
   pelo preset exterior, com o cubo assentado via `placeOnGround` no topo da ilha.
   Mantém o **Editor F2** (decisão do usuário: só Editor, sem OrbitControls — o
   SPEC-0038 segue valendo).

5. **Doc e prompt**: `engine-api.md` ganhou as receitas "Montar cena com .glb",
   "Iluminação exterior" e "Água"; a regra de grounding no `AGENT_SYSTEM_PROMPT`
   foi atualizada pra a nova assinatura; doc da API regenerada (`yarn docs:engine`).

## Consequências

- O engine agora carrega uma camada de **autoria de cena** (carregar/instanciar/
  assentar/iluminar/água) antes ausente — menos código repetido por projeto, mas
  mais superfície pública pra manter e documentar.
- `placeOnGround` mudou de assinatura (era novíssimo, do SPEC-0039, e não chegou a
  ser publicado/usado fora deste repo) — SPEC-0039 marcado como refinado por este.
- O template ficou mais "cheio" (água/ilha/sombras/ECS/editor): mostra mais
  recursos de cara, mas é mais código pra um iniciante ler.
- O `Water` segue experimental; a iluminação é um preset opinativo (verão
  exterior) — jogos com outra direção de arte ajustam via options ou montam à mão.
- A textura de cáusticas **não** é distribuída no template (é asset de terceiro);
  por isso a água do starter é lisa (sem `causticsUrl`).
- Relaciona-se com SPEC-0037 (inspect_assets), 0038 (editor no template) e 0039.
