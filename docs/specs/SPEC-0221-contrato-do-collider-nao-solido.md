# 0221 - Contrato do collider não-sólido (gatilho) no export nativo

**Data:** 2026-09-20
**Status:** aceito

## Contexto

Especifica o comportamento decidido no [ADR-0220](../adrs/ADR-0220-gatilho-nao-solido-fora-do-merge.md):
o que a engine garante para um nó declarado com `collider: { solid: false }`.

Até aqui esse contrato só valia no Studio. No export nativo o merge estático
(ligado por padrão em `isNativeHost()`) fundia o gatilho no cenário, e o
`SceneBuilder` o marcava como parede — o poder do kart-racer batia no carro em
vez de ser coletado.

## Decisão

### O que é um gatilho

Um nó `model`/`primitive`/`mesh` cujo collider **efetivo** (overlay do editor >
`node.collider` > preset do kit) tem `solid === false`. Exemplo do kart-racer:

```json
{ "type": "model", "id": "item-box-yu8cbz", "collider": { "solid": false },
  "url": "assets/kart/pickup-turbo.glb" }
```

### Garantias

1. **Não é parede.** O `SceneBuilder` **não** marca `userData.cortexSolid` nesse
   nó. Consequências em cadeia: o `CharacterPhysicsSystem` não o trata como
   parede, e quem monta colisão a partir de `cortexSolid` (ex.: o trimesh da
   pista do kart-racer) não o inclui.
2. **Não é fundido.** `mergeStaticScene` trata a subárvore como **dinâmica** —
   a entidade com `Collider2DComponent` não-sólido entra em `dynamicRoots`, do
   mesmo jeito que entidades de script/player/corpo rígido. As malhas do gatilho
   continuam na cena, com hierarquia, nome e `userData` (incl. `extras` do GLB)
   intactos.
3. **Continua detectável.** O `Collider2DComponent` é criado com `solid = false`
   (o mundo 2.5D o ignora como chão/parede, mas ele existe pra consulta do jogo).

O que **não** muda: o gatilho continua sendo um nó estático para todo o resto —
não ganha corpo rígido nem é animado pela engine. Quem o esconde/consome é a
lógica do jogo.

### Por que o jogo depende disso

O padrão de coleta do kart-racer (`KartSystem`) usa o objeto individual para três
coisas, e as três quebram se o objeto for fundido:

| Uso | Com o objeto na cena | Fundido (bug) |
| --- | --- | --- |
| `Box3.setFromObject(object)` → raio/centro | caixa real do poder | caixa **vazia** → centro (0,0,0), raio mínimo |
| `object.visible = false` ao coletar | a arte some | esconde um `Group` vazio; a arte está em `static-merged-N` |
| trimesh de colisão do carro | gatilho fica de fora | geometria do poder dentro da malha sólida → o carro bate |

### Medido no kart-racer (export nativo, 18 pickups)

| | antes | depois |
| --- | --- | --- |
| malhas fundidas pelo merge | 1600 | 1312 (−288, as dos pickups) |
| pickups com malhas fundidas | 18/18 (288 malhas) | 0/18 |
| nós marcados `cortexSolid` | pickups inclusos | só os sólidos |
| trimeshes na colisão do carro | 64 | 50 |

No export corrigido o carro atravessa o poder, coleta e usa (HUD: "Escudo",
"Míssil ativado").

## Consequências

- **Testes** (`tests/scene/StaticMerge.test.ts`, `tests/scene/SceneBuilder.test.ts`):
  - malha sob entidade com `Collider2D` **não-sólido** sobrevive ao merge;
  - malha sob entidade com `Collider2D` **sólido** continua sendo fundida (o
    ganho do merge no blockout não regride);
  - nó com `collider.solid: false` **não** recebe `cortexSolid`; com
    `solid` omitido/`true`, recebe.
- Cada gatilho volta a custar um draw call no host. Ver ADR-0220 para o
  trade-off.
- O **export nativo** pega a correção sozinho: ele compila o `src/` do engine e
  ignora o `vendor/` do jogo (ver "Validar uma mudança no export" no
  `docs/cortex-native/architecture.md`). Re-vendorizar (`yarn build:engine` +
  cópia pro `vendor/`) é o que leva a correção pro **Studio** e pro `vite dev`
  do jogo.
