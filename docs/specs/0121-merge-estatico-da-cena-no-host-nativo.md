# SPEC-0121 - Merge da geometria estática da cena (draw calls) no host nativo

**Data:** 2026-07-17
**Status:** aceito

## Contexto

Depois do ADR-0118 a fase 1 do teste4 roda a ~41 fps no host nativo, CPU-bound
no render (~19 ms/frame de `WebGPURenderer` no Hermes; física+ECS ~2 ms). O
plano de perf (.claude/plano-perf-render-nativo.md) previa que fundir os ~90
draw calls do cenário estático derrubaria o custo proporcionalmente.

## Decisão

`mergeStaticScene(root, world?, extraDynamicRoots?)` em `src/scene/StaticMerge.ts`,
chamado **automaticamente no fim do `buildScene` quando roda no host nativo**
(`isNativeHost()`; opt-out/força com `BuildSceneOptions.mergeStatic`). No
browser/Studio fica desligado — o editor F2 precisa dos objetos individuais.

- Agrupa malhas por **assinatura de material** (tipo, cor, mapas, side,
  transparência…) + assinatura de atributos + flags (`cortexSolid`, sombras,
  renderOrder) e funde com `mergeGeometries` + transform de mundo **baked**.
- **Fora do merge** (continuam individuais): subárvores de entidades dinâmicas
  (allowlist: componente ≠ {Transform, Object3D, Collider2D} ⇒ dinâmico —
  inclui entidades de SCRIPT, cujo objeto vive DENTRO do `ScriptComponent`),
  objetos com `SceneAnimator`, skinned, vegetação instanciada, terreno, água
  (`cortexWater`, marcado agora pelo `Water`), invisíveis, multi-material,
  geometria interleaved/morph, layers não-default.
- Um pai só sai da cena se TODA a subárvore dele também fundir (senão um filho
  não-fundido sumiria da tela).
- Física intocada: colliders derivam dos nós ANTES; a malha fundida preserva
  `cortexSolid` e o raycast de chão/parede a enxerga (BVH único, SPEC-0108).

## Consequências (medidas na fase 1 do teste4)

- **Funcionou como mecanismo** (57 malhas → 15 grupos, 33 mantidas; visual e
  física idênticos), **mas o ganho de fps foi marginal: 41 → ~43 fps.** Reduzir
  draw calls não era o gargalo restante: com SSAA 1× ou 2× e com/sem merge o
  frame fica ~23 ms — o custo dominante é o **overhead por-frame do
  WebGPURenderer rodando no interpretador**, não o encoding por objeto.
- O merge fica LIGADO (custo zero em runtime, ajuda mais em cenas maiores que a
  fase 1 e reduz trabalho do BVH/raycast), mas **o próximo salto de fps é o
  item 3 do plano (Static Hermes)** — o multiplicador do JS inteiro.
- Malha skinada nunca é fundida; jogo que precisar de "chão que anda" já usava
  proxy estático (ADR-0118).
- `data.matte`/`shadow`/material por objeto entram na assinatura — grupos só
  fundem com aparência idêntica.
