# 0232 - O laço de render por objeto vai para C++

**Data:** 2026-09-20
**Status:** aceito — fase 1 medida, segue para a fase 2

## Contexto

O ADR-0228 fechou esta mesma pergunta há poucas horas, com medição, e concluiu
**não migrar**: o `renderObject` domina (57% do render) mas não é fatia
vertical, e as fases isoláveis só pagariam com a cena morando em C++ — um
projeto de meses cujo ganho não estava dimensionado.

O que mudou não foi a medição, foi a **régua**. Depois do refino de asset
(ADR-0230), que tirou 25% do render, o jogo continua em **26 fps na corrida**
(38 ms de frame), e o alvo declarado é 60 fps sólido. Com o orçamento de
16,7 ms por frame, e o custo atual de:

| | valor medido |
| --- | --- |
| render | 21 ms (58% do frame) |
| `world` (física/lógica) | 11 ms (31%) |
| ui | 3 ms (8%) |
| custo por draw | **33,5 us** |
| custo por nó (matriz + culling) | 7,8 us |

…não existe caminho até 60 fps por redução de conteúdo: seriam necessários
~180 draws **e** um `world` três vezes menor, num jogo que já teve os assets
refinados.

Duas medições novas fecham o diagnóstico. O mesmo código de trabalho por
objeto (compose de matriz, multiplicação de mundo, teste de frustum), rodado
nos dois runtimes:

| runtime | us por objeto |
| --- | --- |
| **host hoje** (Hermes, bytecode, sem JIT) | **1,103** |
| V8 (JIT) | 0,065 |

**17× de diferença**, no mesmo JavaScript. E ainda assim, mesmo com JIT, não se
chega ao 1 us por draw de uma engine nativa — porque o custo real por draw aqui
é 33,5 us, e a maior parte não é aritmética: é o `three` percorrendo nodes,
bindings, pipelines e cache de RenderObject **por objeto, em JS**.

## Decisão

**O laço de render por objeto passa a ser C++ no host nativo.** O JS descreve a
cena; quem percorre, corta, ordena e submete é código nativo.

É o desenho da Unity, e vale registrar o que ele **não** é, porque foi a
premissa que quase nos levou para o caminho errado: a Unity não resolve console
com JIT. Ela compila o C# AOT (IL2CPP) — e, mais importante, **o laço de render
dela já é C++ desde sempre**. O IL2CPP acelera o código do jogo, não o
renderer. Portanto "ter a performance da Unity" significa ter o renderer
nativo, não um JavaScript mais rápido.

### Alternativas descartadas, com o motivo

| alternativa | por quê não |
| --- | --- |
| **Trocar Hermes por V8/JSC no PC** | daria 17× na aritmética, mas não nos 33,5 us por draw, que são estrutura e não conta; e duplicaria o runtime (PC ≠ console), que é exatamente o que a ADR-0100 quis evitar |
| **Static Hermes (AOT de JS)** | é o IL2CPP do JavaScript e seria a saída elegante, mas o próprio projeto declara a branch `static_h` sem binários, "não pronta para ser testada" e sujeita a regredir entre commits. Não se aposta um jogo nisso |
| **QuickJS** (cogitado na ADR-0100) | também é interpretador sem JIT — mudaria de um interpretador para outro |
| **Reduzir mais conteúdo** | já foi feito (ADR-0230) e rendeu 25%; para 60 fps faltaria cortar mais da metade do que sobrou |

### O que se aproveita do `threepp`

O [`threepp`](https://github.com/markaren/threepp) é um port MIT do `three` para
C++. Como **renderer** ele não serve — backends OpenGL/Vulkan contra o wgpu do
host, `three` r129, sem node materials, e projeto declaradamente voltado a
pesquisa. Mas a parte **independente de backend** é exatamente a fatia que este
ADR move: `Object3D`, `Matrix4`, `Frustum`, `RenderList`. Aproveitar essas
estruturas (respeitando a licença MIT e registrando a origem) evita
reimplementar matemática e travessia já testadas.

## Plano, com ponto de parada medido

**Fase 1 — spike do teto (esta branch).** Um caminho de render mínimo em C++ no
host: N objetos, matriz por objeto, culling, uniforme por objeto e draw, sem
`three` no meio. Mede **us por draw** no mesmo host e na mesma máquina.

O número decide o resto:

- **≤ 5 us/draw** — a migração entrega o alvo (250 draws caberiam em ~1,3 ms de
  laço) e as fases 2+ se justificam.
- **5 a 15 us/draw** — ganho real mas parcial; o ADR volta à mesa com o custo
  revisado antes de qualquer mês de trabalho.
- **> 15 us/draw** — o gargalo não é a linguagem do laço, e migrar não paga. A
  decisão do ADR-0228 se mantém, agora com o teto medido em vez de estimado.

**Fase 2 — espelho de cena em C++.** A hierarquia passa a viver em C++; o JS
manda mudanças, não estado. Sem isso a ponte é paga por objeto e devolve o
ganho — foi o que matou a hipótese da submissão (SPEC-0225).

**Fase 3 — culling, RenderList e sort nativos**, alimentando o caminho de
submissão que já existe.

> **Corrigido em 21/09/2026 (ADR-0237).** Esta linha foi escrita antes do
> ADR-0235 e está **superada**: "alimentar o caminho de submissão que já existe"
> é exatamente a hipótese cujo teto foi medido em 17%. O que a fase 3 entregou
> foi a ponte do espelho de cena (SPEC-0234) — matriz e culling nativos, com o
> `three` ainda desenhando. A RenderList nativa migrou para o ADR-0237.

**Fase 4 — materiais.** É a parte mais acoplada ao `three` (o sistema de nodes)
e a que decide se o `three` sai de vez ou vira só autoria.

> **Detalhada no ADR-0237**, com marcos e critérios numéricos, e com a decisão
> de produto já tomada: o `three` sai do caminho de render no export e continua
> como ferramenta de autoria no Studio.

## Resultado da fase 1 (20/09/2026)

`native/src/webgpu/render_bench.cpp`, mesma máquina, mesmo host, 1.300 objetos
(a árvore medida no `kart-racer`), 300 frames, 10 de aquecimento descartados:

| caminho | us por draw |
| --- | --- |
| laço em JS (`three` no Hermes, SPEC-0227) | 33,5 |
| **laço em C++ (este spike)** | **2,2** |

**15×**, reprodutível em duas execuções (2,203 e 2,169). Cai na faixa
**≤ 5 us/draw**, que este ADR definiu como "a migração entrega o alvo" antes de
qualquer medição.

O que o spike faz por objeto, em C++: compõe a matriz local, multiplica pela de
mundo, testa a esfera contra os 6 planos do frustum, escreve o uniforme e
submete o draw. O que ele **não** faz, e por isso 2,2 us é o **teto otimista do
laço**, não uma previsão do render completo: shader trivial (sem material), sem
passe de sombra, sem pós-processamento.

Parte da vantagem é justamente o que se ganha ao fazer nativo direito: o spike
usa **um bind group com offset dinâmico**, enquanto o `three` cria um bind group
por objeto — e isso está dentro dos 33,5 us.

Traduzindo para o jogo, com as contas de hoje (287 draws no `hold`, render de
17,0 ms): o laço nativo equivalente custaria **~0,6 ms**. Mesmo somando
materiais, sombras e pós, o render cairia para a casa de poucos milissegundos —
e o orçamento de 16,7 ms por frame passa a fechar, pela primeira vez.

### O que isso resolve sobre "V8 no PC, C++ no console"

A pergunta foi levantada durante a fase 1 e o número a responde: com o laço
nativo em 2,2 us, **o mesmo caminho serve PC e console**. Manter V8 no PC seria
somar um segundo runtime (e a classe de bugs dele) a um C++ que seria escrito
de qualquer forma para o console — sem chegar perto de 2,2 us, porque o custo
em JS é estrutura do `three`, não aritmética.

## Consequências

- O host deixa de ser "um browser mínimo que roda o engine" e passa a ser
  **uma engine com runtime de script** — mudança de identidade que afeta
  `docs/cortex-native/architecture.md` e o PRD-0004.
- Paridade com o browser (Studio) deixa de ser automática: hoje o mesmo bundle
  roda nos dois. A partir da fase 2, o Studio e o host divergem no caminho de
  render, e a paridade vira contrato explícito de API, não de implementação.
- O trabalho é por fases com número em cada porta. Se a fase 1 disser que não
  paga, o custo total terá sido um spike — e não meses.
