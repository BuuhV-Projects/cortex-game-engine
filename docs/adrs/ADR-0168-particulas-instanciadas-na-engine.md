# ADR-0168 - Partículas instanciadas na engine (CPU + InstancedMesh)

**Data:** 2026-07-29
**Status:** aceito

## Contexto

A engine não tem partículas. Nenhuma. Isso apareceu num pedido concreto: a fase do
mundo extra do teste4 (spec 0026 do jogo) termina num portal, e o usuário quis um
**efeito na chegada** em vez de só abrir o modal de pontuação — "talvez seja o
efeito de partículas".

O pedido é a ponta de uma lista que o jogo inteiro já teria usado: poeira ao
aterrissar, respingo na água do aquapark, fagulha ao pegar a última coroa, fumaça
do canhão de açúcar, rastro do drone. Hoje cada um desses ou não existe ou é
improvisado com transform de malha.

Restrições que pesam na escolha:

- **Host nativo** (`native/`, Hermes + wgpu): o `naga` **miscompila vertex color**
  em `MeshStandardMaterial` — COLOR_0 renderiza branco (memória do port). O
  `instanceColor` do three É um atributo de instância que entra como vertex color,
  então cor/alpha por partícula é exatamente a família de recurso que já nos
  mordeu.
- **Perfil de CPU do host**: o gargalo medido no gameplay nativo é o render
  (three WebGPU no Hermes, ~20 ms/frame), não a física. Uma solução que troque
  draw calls por trabalho de CPU precisa ser barata no JS.
- A engine já tem **instancing provado** (`Vegetation.ts`, SPEC-0077:
  `InstancedMesh` com milhares de instâncias, um draw call por geometria) e
  **sprites unlit** (`Sprite.ts`, `MeshBasicMaterial`).

## Decisão

Sistema de partículas **CPU + `InstancedMesh` de quads billboard**, com pool de
tamanho fixo, exposto como **nó de cena** (`particles`) e como **API
programática** (`ParticleEmitter` / `spawnParticles`).

### Por que não as alternativas

| Alternativa | Por que não |
|---|---|
| **`THREE.Points`** | Mais barato, mas `PointsMaterial` não gira a partícula, o tamanho em pixel não acompanha a perspectiva do mesmo jeito, e o comportamento de `sizeAttenuation` no wgpu do host é território não testado. O ganho não paga o risco. |
| **Simulação em GPU** (shader/compute) | O caminho certo pra dezenas de milhares de partículas — e o pior caminho pra estrear num runtime onde o compilador de shader já nos deu resultado errado silencioso. Fica registrado como evolução, atrás de teste no host. |
| **Biblioteca de terceiros** (three.quarks, nebula) | Traz shader próprio (mesmo risco no naga), peso no bundle vendorizado e um vocabulário de dados que não é o do `SceneDefinition`. |
| **Sprite por partícula** (um `Mesh` cada) | Um draw call por partícula; morre no host antes de ficar bonito. |

### O que fica de fora na v1 (e por quê)

**Cor e opacidade POR PARTÍCULA.** Exigiriam `instanceColor` — vertex color de
instância, o recurso que o `naga` miscompila. Em vez disso:

- **cor é do emissor** (uniform do material), com `color` → `colorTo` interpolado
  no material inteiro ao longo do tempo quando o emissor é de vida curta (burst);
- **o fade é por ESCALA**: a partícula encolhe até zero no fim da vida. Com
  `AdditiveBlending` (o default pra fagulha/fogo) encolher lê como apagar, porque
  o brilho somado cai com a área.

Isso é limitação real: uma partícula não pode ir de amarelo a vermelho
individualmente. O contorno é usar **dois emissores** sobrepostos com cores
diferentes e vidas diferentes — o que cobre fogo, fumaça e fagulha, os três casos
que o jogo pediu. Cor por partícula entra quando houver teste no host provando
que `instanceColor` compila (e aí é aditivo, sem quebrar a API).

### Forma da API

**Dado da cena** (nó `particles` no `SceneDefinition`) — porque é a regra da
engine: o que é autorável tem que ser editável no Inspector, não cravado em
código. Um braseiro que solta fagulha é propriedade do braseiro.

**API programática** pro que é EVENTO, não cenário: a explosão de moeda ao
coletar, a poeira no pouso, o clarão do portal na chegada. Evento não mora no
`level.json` — quem dispara é o script.

### Simulação

Pool fixo (`max`), sem alocação por partícula: arrays planos (`Float32Array`) pra
posição/velocidade/vida/tamanho/rotação, índice de partícula morta reciclado.
O `update(dt)` percorre o pool, integra (gravidade + drag), escreve a matriz de
cada instância viva e ajusta `instanceMatrix.needsUpdate` + `count` — o mesmo
mecanismo do `Vegetation`. Billboard: a matriz orienta o quad pela rotação da
câmera (a câmera já chega ao `buildScene` por `options.camera`, como a água usa).

O avanço entra no `SceneHandle.update`, junto da água e do animator — um lugar só
pra "coisas da cena que andam por frame".

## Consequências

- **A engine passa a ter efeito de partícula** como primitiva de cena, e o
  primeiro uso (portal da chegada) deixa de ser improviso de transform.
- **Um draw call por emissor**, independente do número de partículas.
- **Cor por partícula é a dívida explícita** da v1 — documentada aqui e na spec,
  com o contorno (dois emissores) e a condição pra sair (teste de `instanceColor`
  no host nativo).
- **Textura é opcional**: sem `texture`, o emissor gera um disco suave por código
  (`DataTexture` com falloff radial), pra efeito funcionar sem asset novo — e sem
  depender de `canvas`, que não é garantido no host.
- Mais um sistema que roda por frame na CPU: o pool é limitado por `max` de
  propósito, e a spec fixa um teto recomendado por cena.
