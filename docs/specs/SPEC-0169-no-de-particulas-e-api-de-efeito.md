# SPEC-0169 - Nó `particles` e API de efeito

**Data:** 2026-07-29
**Status:** aceito
**Decisão que a sustenta:** [ADR-0168](../adrs/ADR-0168-particulas-instanciadas-na-engine.md)

## Contexto

O ADR-0168 decidiu **como** as partículas são feitas (CPU + `InstancedMesh`
billboard, pool fixo, sem cor por partícula). Esta spec descreve **o que existe**:
os campos do nó, a API de código, o ciclo de vida e como o efeito entra numa cena.

## Decisão

### 1. Nó de cena `particles`

Emissor como DADO — aparece no Inspector e vive no `level.json`, como todo o resto
que é autorável. Campos (todos opcionais menos `type`/`id`):

```jsonc
{
  "type": "particles",
  "id": "portal-sparks",
  "place": { "x": 304, "y": 6, "z": 3 },
  "texture": "assets/fx/spark.png", // ausente = disco suave gerado por código
  "max": 200,            // capacidade do pool (teto de partículas vivas)
  "rate": 30,            // emissão contínua, partículas/segundo (0 = só burst)
  "burst": 24,           // emissão instantânea ao nascer/ao chamar burst()
  "loop": true,          // false = emite `rate` até o primeiro ciclo e para
  "life": [0.8, 1.4],    // faixa de vida em segundos
  "size": [0.15, 0.35],  // faixa de lado do quad, em unidades
  "speed": [1, 3],       // faixa de velocidade inicial
  "direction": [0, 1, 0],// direção base da emissão
  "spread": 0.4,         // abertura do cone em torno de `direction` (rad)
  "gravity": -2,         // aceleração em Y (u/s²)
  "drag": 0.2,           // fração de velocidade perdida por segundo
  "spin": 2,             // rotação da partícula no plano da tela (rad/s)
  "color": "#ffd66a",    // cor do EMISSOR (ADR-0168: não é por partícula)
  "opacity": 1,
  "blending": "additive" // "additive" (fogo/fagulha) | "normal" (fumaça/poeira)
}
```

**Faixas são pares `[min, max]`** e sorteiam por partícula — é o que faz duas
fagulhas não parecerem a mesma. Valor único no lugar do par também é aceito
(`life: 1.2`), pra emissor sem variação.

**A partícula vive no espaço do EMISSOR.** Toda partícula nasce na origem dele e
acompanha o nó: mover o emissor leva as vivas junto. Isso é exato pro caso comum
(emissor parado: braseiro, portal, poeira de pouso) e é limitação pro emissor
MÓVEL — não existe rastro que fica pra trás na v1.

Um `worldSpace` chegou a ser desenhado e caiu na implementação: converter a
posição do emissor para o próprio espaço local dá sempre zero, e fazer a partícula
se soltar de verdade exige o `InstancedMesh` num nó separado do que se move (a
malha na raiz da cena, a âncora seguindo o objeto). Fica pra quando houver o
primeiro rastro real a construir, em vez de um campo que promete o que o código
não faz.

### 2. API programática

Pro que é EVENTO e não cenário — quem dispara é o script:

```ts
// Efeito pontual que se limpa sozinho ao fim das partículas.
spawnParticles(scene, { position, burst: 30, ...opts })

// Emissor sob controle do chamador.
const emitter = new ParticleEmitter(opts)
scene.add(emitter.object)
emitter.burst(12)     // dispara N na hora
emitter.stop()        // para de emitir; as vivas terminam a vida
emitter.dispose()     // libera geometria/material/textura
```

O `update(dt, camera)` do emissor é chamado pelo `SceneHandle.update` para os nós
da cena. Emissor criado à mão fora do `buildScene` precisa ser atualizado pelo
chamador (o jogo já roda um loop; é uma linha).

### 3. Ciclo de vida e custo

- Pool de tamanho fixo (`max`): buffers planos alocados uma vez, índice de
  partícula morta reciclado. **Nada de alocação por partícula** — a engine já
  paga caro em GC no host nativo.
- `count` do `InstancedMesh` acompanha o número de vivas: partícula morta não
  desenha nem paga vértice.
- **Um draw call por emissor.** Teto recomendado: **~8 emissores simultâneos e 2 000
  partículas vivas** por cena no PC; no host nativo, metade disso (o gargalo lá é
  o render, memória do port).
- O fade é por **escala** (a partícula encolhe até zero), não por alpha — ver
  ADR-0168 §"o que fica de fora".

### 4. Textura default sem asset

Sem `texture`, o emissor gera um **disco com falloff radial** por código
(`DataTexture` 64², sem `canvas` — que não é garantido no host nativo). Serve
fagulha, brilho e poeira; textura própria entra quando o efeito pedir forma
(fumaça, folha, estilhaço).

### 5. Editor

O nó aparece no Inspector como os outros: `place` editável pelo gizmo e os campos
numéricos na seção "Partículas". Como o emissor é visual e sem colisão, ele entra
com `disableRaycast` implícito — nenhuma partícula vira chão (a armadilha do
`visible=false` ainda é chão vale pra malha, não pra isto, mas o princípio é o
mesmo: efeito nunca é física).

## Consequências

- Efeito de partícula passa a ser **autorável** (nó) e **disparável** (API), com o
  mesmo vocabulário nos dois.
- **Cor por partícula não existe** na v1 (ADR-0168): gradiente se faz com dois
  emissores sobrepostos de cores e vidas diferentes.
- **Rastro de emissor móvel não existe** na v1 (ver acima): a partícula acompanha
  o emissor.
- Coberto por `tests/scene/particles.test.ts` (22 casos): reciclagem de slot,
  `max` como teto, a fração de emissão que não se perde entre frames, gravidade,
  drag, o fade por escala, o cone (inclusive **direção vertical**, que degenera a
  base ortonormal se construída com o próprio eixo Y), higiene de material, o
  raycast que não devolve nada e o schema do nó.
- Novo módulo público `src/scene/Particles.ts` — entra no `index-runtime.ts` e,
  por isso, também no `VENDOR_TYPE_MODULES` do `electron/main.ts` (senão o editor
  do Studio mostra o tipo como não-resolvido).
- O `SceneDefinition` ganha um tipo de nó; cenas antigas seguem válidas (o nó é
  novo, nada mudou nos existentes).
