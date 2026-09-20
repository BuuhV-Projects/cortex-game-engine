# 0220 - Gatilho não-sólido não é cenário: fora do merge e sem `cortexSolid`

**Data:** 2026-09-20
**Status:** aceito

## Contexto

No export nativo do **kart-racer**, passar o carro por uma caixa de poder
(`item-box-*`) **batia** como se fosse parede: o carro parava, o item não era
coletado e a arte do poder não sumia. No Studio o mesmo mapa funciona. Os três
sintomas têm uma causa só.

Os `item-box-*` são nós `model` do `level.json` com `"collider": { "solid":
false }` — um **gatilho**: existe pra ser detectado pelo jogo, não pra ser
obstáculo. O `buildScene` monta pra eles uma entidade com
`{Transform, Object3D, Collider2D}`.

Dois pontos da engine tratam esse nó como cenário sólido:

1. **`SceneBuilder`** marca `userData.cortexSolid = true` em **todo** nó do ramo
   estático, sem olhar `collider.solid` — inclusive nos gatilhos. `cortexSolid`
   quer dizer "é parede" (`CharacterPhysicsSystem`), então um gatilho nasce
   marcado como parede.
2. **`mergeStaticScene`** (SPEC-0121) usa uma allowlist por componente:
   `{Transform, Object3D, Collider2D}` = estático ⇒ funde. O gatilho cai
   exatamente nessa assinatura, então as malhas dele são **assadas na malha
   fundida e removidas da cena**. O merge liga por padrão **só no host nativo** —
   daí o bug existir no export e não no Studio.

Depois do merge, o que sobra do poder é um `Group` **vazio**, e a arte vive
dentro de `static-merged-N`, que herda `cortexSolid`. O efeito em cascata:

- o trimesh de colisão do carro é montado a partir dos nós `cortexSolid` e
  **engole a malha fundida inteira**, com a geometria dos poderes dentro → o
  carro bate;
- `Box3.setFromObject` no grupo vazio devolve caixa vazia → centro (0,0,0) e raio
  mínimo → o teste de proximidade da coleta nunca acerta;
- `object.visible = false` esconde um grupo vazio → o poder não some.

O kart-racer já tinha um contorno pro ponto 1 (`createCar` ignora nós cujo
`Collider2DComponent.solid === false`), mas o contorno depende do objeto
individual existir — e o merge é justamente quem o apaga.

## Decisão

**Um collider não-sólido (`solid: false`) é um gatilho, não cenário.** A engine
passa a tratá-lo assim nos dois pontos:

1. **`SceneBuilder` não marca `cortexSolid`** quando o collider efetivo tem
   `solid === false`. Parede é só o que é sólido.
2. **`mergeStaticScene` não funde** a subárvore de uma entidade cujo
   `Collider2DComponent` é não-sólido — ela entra em `dynamicRoots`, junto de
   script/player/corpo rígido.

Um gatilho é, por definição, um objeto que a lógica do jogo liga/desliga, mede e
consome. Fundir a arte dele com o cenário tira do jogo o controle sobre o próprio
objeto — é a mesma razão pela qual entidades de script já ficam fora do merge.

Alternativas consideradas:

- **O jogo marcar cada pickup como dinâmico** (ex.: um componente-carimbo). Joga
  no jogo um detalhe de implementação da engine, e todo jogo com gatilho teria de
  redescobrir o mesmo bug — o kart-racer já havia contornado metade dele.
- **Não fundir nada que tenha entidade ECS.** Mataria o ganho do merge: o
  blockout estático sólido (o grosso do cenário) também tem entidade com
  `Collider2D`, e é exatamente o que vale a pena fundir.
- **Excluir o gatilho só do trimesh do carro**, no jogo. Trata um sintoma: a
  coleta e o sumiço da arte continuariam quebrados.

O Inspector não expõe `solid` (o "Estático" que ele autora é sempre sólido),
então `PhysicsAuthoring` continua marcando `cortexSolid` ao setar Estático —
coerente com o que essa autoria significa.

## Consequências

- Gatilho declarado com `collider.solid: false` passa a se comportar igual no
  Studio e no export: atravessa, é coletável e some quando o jogo o esconde.
- O merge fica um pouco menos agressivo: cada gatilho volta a ser um draw call.
  É pouco (dezenas de pickups, não milhares de peças de cenário) e o custo é o
  preço do jogo ter controle sobre o objeto.
- Quem dependia de `solid: false` **e** de colisão ao mesmo tempo perde a
  colisão. Não é um uso previsto — `solid: false` sempre significou "não é
  parede"; era a marcação de `cortexSolid` que contradizia a própria declaração.
- O contorno do kart-racer em `createCar` continua válido e agora é redundante
  (defesa em profundidade): o gatilho nem chega marcado como sólido.

Comportamento detalhado e casos de teste: SPEC-0221.
