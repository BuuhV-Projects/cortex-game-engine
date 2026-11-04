# SPEC-0684 — Object3DSync congela as entidades estáticas fundidas

**Data:** 2026-11-04
**Status:** implementado

## Contexto

DDD 00 (Port Hollow), export nativo (Hermes sem JIT), pose centro: `world` 5,1 ms, com o `Object3DSyncSystem` em
22% (~1,1 ms). Depois da SPEC-0673 o sync não escreve nada numa entidade parada, mas ainda **visita** todas: são
~2,1 mil pares `(TransformComponent, Object3DComponent)` por quadro, quase todos de colisores estáticos que o
`SceneBuilder` cria (`Transform + Object3D + Collider2D`). Cinco leituras e comparações por par, ~0,5 µs no
interpretador, dão o ~1,1 ms medido.

O merge estático (SPEC-0120, só no host nativo) **já classifica** essas entidades: a que tem só componentes do
conjunto estático (`TransformComponent`, `Object3DComponent`, `Collider2DComponent` sólido) tem a arte fundida em
espaço de mundo, numa malha nova na raiz. Mover o transform dela, depois do merge, não aparece na tela — a malha
original saiu da cena. O sync passa por ela todo quadro sem efeito.

## Decisão

### Congelar = sincronizar uma vez e sair do laço

`Object3DComponent` ganha o campo `frozen` (default `false`). Uma entidade congelada fica **fora dos pares** do
`Object3DSyncSystem`: o laço por quadro só visita as não congeladas. O campo só é lido no `_rebuild` (quando o
array de entidades troca), nunca por quadro.

API pública, métodos estáticos do sistema (o sistema não precisa estar no mundo para chamá-los):

- `Object3DSyncSystem.freeze(entity)`: copia o transform para o `Object3D` **uma vez** (posição, `rotation.order
  = 'YXZ'` e yaw, o mesmo que um quadro do sync faria), marca `frozen` e sobe a versão de estrutura do ECS
  (`bumpStructureVersion`, ADR-0676), para o sync refazer os pares no próximo quadro. Devolve `false` se faltar
  `TransformComponent` ou `Object3DComponent`.
- `Object3DSyncSystem.unfreeze(entity)`: desmarca e sobe a versão; no próximo quadro a entidade volta ao laço e
  é sincronizada nele. É o caminho para quem quiser mover uma estática fundida (com o merge ligado, a arte dela já
  está na malha fundida — só o que não foi fundido acompanha).
- `Object3DSyncSystem.isFrozen(entity)`.

O sync único do `freeze` é o que garante a pose: a malha "mantida" pelo merge (grupo de 1, assinatura de
atributos diferente, etc.) continua na cena com o objeto original, e o primeiro quadro do sync antigo acertava
nela a ordem `YXZ` e a pose do transform. O `freeze` faz exatamente essa escrita.

### Quem congela: o merge, pela mesma classificação

`mergeStaticScene(root, world, extraDynamicRoots)`, depois de fundir, congela cada entidade do `world` com
`TransformComponent + Object3DComponent` que:

1. é estática pelos componentes (`isStaticEntity`: todos no conjunto `STATIC_COMPONENTS` e collider não-gatilho —
   a mesma regra que o merge já usava para escolher as raízes dinâmicas);
2. não tem o objeto sob uma raiz dinâmica (entidade dinâmica, script, `extraDynamicRoots` como as raízes do
   `SceneAnimator`);
3. não tem o objeto (nem ancestral) marcado com exclusão de `userData` do merge (`cortexDynamic`, `cortexVehicle`,
   água, vegetação, terreno, editor) nem invisível.

Ou seja: congela só o que o merge considerou cenário. O que ele deixou de fora (porque o jogo vai mexer) continua
no laço. A classificação (`STATIC_COMPONENTS`, `isStaticEntity`, `dynamicRoots`, exclusão por `userData`) sai do
`StaticMerge.ts` para `src/scene/staticClassification.ts` (o merge e o congelamento usam a mesma), e o
`StaticMerge.ts` volta a ficar abaixo de 500 linhas. `StaticMergeStats` ganha `frozen` (quantas foram congeladas).

O congelamento é **depois** do merge: o merge assa a matriz de mundo do momento (como antes), e o `freeze` faz a
escrita que o primeiro quadro do sync faria. A pose final de cada objeto é a mesma do caminho antigo.

### Entidade que ganha componente depois do build volta a ser dinâmica

A classificação vale no momento do merge. Se uma congelada ganha um componente fora do conjunto estático (o jogo
põe um script, um corpo, um `VelocityComponent`), ela precisa voltar ao laço. A conferência é feita **só na troca
de estrutura**, no `_rebuild` do sync, que já roda nessas trocas:

- `Entity` ganha `componentsVersion`, um contador que sobe a cada `addComponent` e a cada `removeComponent` que
  remove de fato. O `freeze` guarda a versão do momento no componente.
- No `_rebuild`, para cada congelada: versão igual → continua congelada (uma comparação de inteiro). Versão
  diferente → confere os tipos (`isStaticEntity`); ainda estática, guarda a versão nova e segue congelada; senão,
  **descongela** e entra nos pares, sendo sincronizada já naquele quadro.

Troca do `Object3DComponent` por outro (novo objeto) também descongela: o componente novo nasce com `frozen =
false`.

### Por que agora vale e a SPEC-0673 recusou

A SPEC-0673 recusou a "lista explícita de estáticos fora do sync" porque exigiria marcar estático no
`SceneBuilder` e confiar que ninguém move um estático — e o editor F2 move qualquer objeto. Aqui a marca vem do
**merge**, que nunca roda junto do editor: ele só liga no host nativo (`mergeStatic ?? isNativeHost()`), e no
browser/Studio o F2 precisa dos objetos individuais, então lá nada é congelado e o sync se comporta como antes. E
onde o merge roda, mover o transform de uma estática fundida já não tinha efeito visual. O que muda de semântica
é pouco e tem saída (`unfreeze`).

### Alternativas consideradas

- **Marcar estático no `SceneBuilder` (`createPlatformerEntity`).** Valeria também sem merge, mas no browser o
  editor move esses objetos; seria preciso descongelar em cada gesto do F2. O merge já define o estático e já é
  desligado no editor.
- **Lista de candidatos a sujar no `TransformComponent` (setters).** Recusada na SPEC-0673 pelo custo dos
  acessores no Hermes e pela mudança de semântica.

## Consequências

- No host nativo, o laço por quadro do sync passa de ~2,1 mil pares para as entidades não fundidas (jogador,
  personagens, gatilhos, scripts, marcadas `cortexDynamic`).
- Cada troca de estrutura do ECS custa, para cada congelada, uma leitura de `componentsVersion` a mais no
  `_rebuild` (que já percorria todas). A conferência de tipos só roda para a entidade cuja estrutura mudou.
- **Muda:** escrever no `TransformComponent` de uma entidade congelada não chega ao `Object3D`. Antes do merge isso
  movia o objeto; com o merge, só movia a malha que ficou "mantida" ou um `Group` já vazio. Quem precisa mover:
  `Object3DSyncSystem.unfreeze(entity)` ou marcar o objeto com `userData.cortexDynamic` antes do build (o merge
  então não funde nem congela). Trocar o objeto (`object3D.object = outro`) de uma congelada também não sincroniza
  até descongelar.
- Collider que passa a gatilho (`solid = false`) depois do build não descongela (não é troca de estrutura).
- Browser/Studio sem merge: nada muda.
- Testes: `tests/systems/object3dSyncFreeze.test.ts` (congelada fora do laço e com a pose do primeiro sync,
  contagem de pares, `unfreeze` devolve, componente novo descongela, componente estático novo não, troca do
  `Object3DComponent`) e `tests/scene/staticMergeFreeze.test.ts` (equivalência com o caminho antigo depois do
  merge; estática congelada, dinâmica, gatilho, `cortexDynamic` e raiz animada não; sem `world`, nada congela).
