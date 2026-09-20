# 0225 - Cronômetro da ponte NAPI no caminho de render

**Data:** 2026-09-20
**Status:** aceito

## Contexto

Depois da campanha de perf do `kart-racer` (SPEC-0005 a 0011 do jogo), o frame
ficou em 51 ms, dos quais **33 ms são render**. A decomposição por medianas em
faixas de draws deu:

```
render = 10,4 ms fixo + 68 us por draw
```

**68 us por draw é a constante que governa tudo.** Enquanto ela não cair, não
há corte de draw que leve o jogo a 60 fps: mesmo com zero draws sobrariam os
10,4 ms fixos mais física e UI.

A pergunta que decide o próximo passo é **onde** esses 68 us são gastos:

- na **travessia JS→C++** (marshalling NAPI, uma por comando WebGPU), ou
- no **`three` em JS** antes de chegar lá (percorrer a cena, ordenar a
  RenderList, atualizar nós de material e bindings no Hermes sem JIT).

A resposta muda a decisão inteira. Se a ponte for a maior parte, mover a
submissão para C++ (juntar comandos, evitar uma chamada por draw) paga. Se for
o `three`, mover submissão entrega pouco e o alvo é outro.

Hoje o host **conta** as travessias (`__cortexNapiStats`, SPEC-0134: draw, bind
group, pipeline, writeBuffer) e o HUD as mostra. O que falta é o **tempo**.

## Decisão

Somar, por frame, os nanossegundos gastos **dentro** das funções NAPI do
caminho de render, e expor junto dos contadores.

- `NapiFrameStats` ganha `nanos` (uint64).
- Um cronômetro de escopo (`NapiTimer`) declarado na **primeira linha** de cada
  callback instrumentado — assim o tempo inclui o marshalling dos argumentos,
  que é justamente o custo em questão, e não só a chamada ao wgpu.
- Os `bump*()` **continuam onde estão**. Alguns são condicionais (só contam
  quando a validação passa); mover para o topo mudaria o significado dos
  números que o HUD já mostra. Contagem e tempo medem coisas ligeiramente
  diferentes de propósito, e isso está documentado no header.
- O HUD (`DebugHud`) passa a mostrar o total em ms ao lado das contagens.

Instrumentadas: `setPipeline`, `setBindGroup`, `setVertexBuffer`,
`setIndexBuffer`, `draw`, `drawIndexed`, `writeBuffer`, `submit` — as mesmas
que já são contadas.

## Consequências

- Duas leituras de relógio por chamada NAPI. Com ~2000 chamadas por frame, ao
  custo típico de ~20 ns de um `steady_clock::now()`, são ~0,08 ms por frame —
  abaixo de 0,3% do render atual. O instrumento não distorce o que mede de
  forma relevante, mas **é sempre ligado**, o que é uma escolha: o valor de ter
  o número em toda sessão supera 0,08 ms.
- `nanos` mede tempo **dentro** do C++, incluindo o que o wgpu faz. Não separa
  marshalling de trabalho real de GPU driver — para isso seria preciso
  cronometrar por categoria, o que fica para quando/se a conta apontar para lá.
- O número é do **último frame fechado**, como os contadores, pelo mesmo motivo
  (o HUD lê no meio de um frame).

## Resultado: a ponte não é o gargalo

Medido no `kart-racer` com o modo benchmark, 60 amostras da corrida:

| | |
| --- | --- |
| draws | 385 |
| render | 34 ms |
| **dentro da ponte NAPI** | **5,9 ms — 17%** |
| fora dela (`three` em JS) | 28,1 ms — 83% |

Por draw: **88 us no total, dos quais 15 us são a ponte e 73 us são o `three`
em JS** antes de chegar nela.

**Portanto: mover a submissão de draw para C++ não paga.** Mesmo eliminando a
ponte por inteiro — o que é impossível, porque alguém tem que falar com o wgpu
— o teto do ganho é 17% do render, ~6 ms de um frame de 51. O custo está em
percorrer a cena, ordenar a RenderList, atualizar nós de material e bindings
**em JS, no Hermes sem JIT**, e isso acontece por objeto, antes de qualquer
comando WebGPU existir.

Isso encerra a hipótese que vinha do PRD-0005 (M-perf-2) de que a travessia
JS→C++ era o teto de CPU do render. Ela é real, é medida, e é um sexto do
problema.

### Ressalva honesta sobre o número

O cronômetro cobre as **8 funções instrumentadas** — as que escalam com o
número de draws. Outras chamadas ao host no caminho de render (`beginRenderPass`,
criação de bind group, upload de textura) **não** entram nos 5,9 ms. O valor é
portanto um piso para "custo da ponte", não o total.

Mas a pergunta que motivou a medição era sobre o que escala **por draw**, e
para essa pergunta as 8 são exatamente as certas: são ~2000 chamadas por frame,
proporcionais aos draws.

### O que isso redireciona

- **Menos objetos continua sendo a única alavanca que escala.** A 73 us de JS
  por draw, chegar a 60 fps (16,7 ms) exigiria algo como 180 draws no total —
  menos da metade dos 385 de hoje.
- Os **451 `writeBuffer` por frame** seguem sem explicação e agora são o
  próximo alvo óbvio: se forem uniformes de objeto estático reescritos todo
  frame, o ganho é dos dois lados — menos trabalho em JS **e** menos travessias.
