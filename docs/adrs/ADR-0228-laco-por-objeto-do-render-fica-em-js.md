# 0228 - O laço por objeto do render fica em JS

**Data:** 2026-09-20
**Status:** aceito

## Contexto

A campanha de performance do `kart-racer` levou o jogo de 11 para 40 fps no
export nativo (com quedas a 23 quando há muitos carros na tela). O que restava
em aberto era a única alavanca estrutural que sobrou: **mover o trabalho por
objeto do render para C++**.

Duas hipóteses já tinham caído antes desta decisão, ambas por medição:

- **Mover a submissão de draw para C++** (SPEC-0225): teto de 17% do render,
  porque a ponte NAPI é só 15 dos 88 us por draw. Não paga.
- **Instanciar as rodas dos carros** (SPEC-0012 do jogo): implementada e
  revertida — com o mesmo número de draws o build instanciado ficava igual ou
  pior, porque cada `InstancedMesh` paga um `writeBuffer` por frame mesmo
  parada.

Faltava dividir os **73 us por draw de `three` em JS** entre as fases do
render. Sem essa divisão, escolher o que reescrever em C++ seria chute — e o
custo do chute são meses.

A SPEC-0226 (relógio de alta resolução) e a SPEC-0227 (sonda de fases)
existiram para permitir esta decisão.

## Medição

Cenário `?bench&hold` (cena parada, a IA não dirige), **383 draws idênticos em
todas as rodadas**, export `--debug`, máquina ociosa, janela minimizada,
medianas de ~90-130 amostras. Relógio verificado em runtime: resolução de
100 ns. Custo do próprio instrumento medido por uma rodada de nível 0: +5,6%.

Render sem instrumento: **21,4 ms / 55,9 us por draw**.

| fase | % do render | us/draw |
| --- | --- | --- |
| `renderObject` (bindings, nodes, pipeline, submissão) | **57%** | 33,5 |
| travessia de matriz (`updateMatrixWorld`) | 20% | 11,8 |
| culling + montagem da RenderList | 18% | 10,5 |
| o laço que percorre a RenderList | 1% | 0,6 |
| resto (sort, finish, setup de passe) | 4% | 2,5 |

Dentro do `renderObject`, em proporção dele: `_nodes.*` 33%, `backend.draw`
18%, `_objects.get` 15%, `_bindings.updateForRender` 12%, `_pipelines.*` 11%,
geometria 4%.

A árvore tem **1.271 `Object3D`** para 383 draws, e o custo das duas fases de
travessia é **por nó**: 3,8 us/nó para matriz e 4,0 us/nó visível para culling.
O censo mostra que **os 6 carros carregam 509 desses nós (40%)** — 92 por
carro, sendo ~77 das quatro rodas —, enquanto o cenário estático praticamente
sumiu da árvore (o `mergeStaticScene` já o fundiu).

## Decisão

**O laço por objeto do render continua em JS. Nenhuma fase migra para C++
agora.** O motivo é que a fase que domina não é uma fatia vertical, e as que
são fatias não valem o que custam:

1. **`renderObject` (57%) não é migrável em fatia.** Um terço dele é o sistema
   de nodes — o coração do renderer de materiais do `three` (TSL). Migrá-lo não
   é fatiar o renderer, é reescrevê-lo, junto com materiais e shaders. É o
   oposto de uma fatia vertical.
2. **As fases isoláveis (matriz + culling, 38%) só pagam com a cena morando em
   C++.** Ambas percorrem a hierarquia; deixá-la em JS e empurrar transform por
   objeto por frame reintroduz exatamente a travessia de ponte que matou a
   hipótese da submissão (15 us por travessia contra os ~4 us que a fase gasta
   por nó).
3. **O `threepp` não encurta esse caminho.** Ele porta o `three` r129 para
   OpenGL 3.3 e Vulkan — nenhum dos dois é o wgpu/D3D12 do host —, não tem o
   sistema de node materials de que a engine depende, e o próprio projeto se
   declara voltado a pesquisa e ensino, com API e comportamento sujeitos a
   mudar. O que nele seria aproveitável (`Object3D`, `Matrix4`, `Frustum`,
   `RenderList`, MIT) é justamente a parte isolável — a que menos rende — e não
   a que domina.

### O que fazer no lugar

A alternativa com melhor razão entre ganho e custo é **não percorrer**, e o
teto dela foi medido, não estimado: congelando a atualização de matriz no
cenário parado (onde a imagem sai idêntica), com os mesmos 383 draws:

| | render | fase de matriz |
| --- | --- | --- |
| travessia livre | 21,3 ms | 4,48 ms |
| travessia congelada | **17,8 ms** | 0,20 ms |

**3,5 ms, 16,4% do render** — sem tocar em C++. É o teto do melhor caso: na
corrida, os 509 nós de carro precisam mesmo atualizar, então o ganho realista
fica na casa de 12%. O caminho é tornar a atualização dirigida por mudança
(o ECS já é dono dos transforms) em vez de recompor a matriz de todo nó todo
frame, que é o que o `three` faz por default.

## Consequências

- A campanha de perf deixa de ter "portar o render para C++" como próximo
  passo. O PRD-0005 (M-perf-2), que supunha ganho na submissão, fica
  formalmente superado pelas SPEC-0225 e por este ADR.
- O teto de performance do host continua **arquitetural**: o renderer roda
  dentro do Hermes sem JIT, e é por isso que 383 draws custam 21 ms aqui e
  ~1-2 us por objeto numa engine com o laço em C++. Aceitar isso significa que
  ganhos futuros vêm de **ter menos objetos e menos nós**, não de reescrever o
  laço.
- Os carros seguem sendo o alvo mais gordo: 40% da árvore e a origem das
  quedas para 23 fps. A causa é de asset, não de código (modelos gerados sem
  direcionamento de performance, um material por peça — SPEC-0224), e a
  correção barata continua sendo do lado do modelo.
- A sonda da SPEC-0227 fica no repositório, desligada por default. Qualquer
  reabertura desta decisão deve vir com números dela, no mesmo método:
  medianas, `draws` conferidos entre os lados, e o custo do instrumento
  descontado.

## Se um dia for reaberto

O que mudaria a conta: uma engine de render onde a **cena inteira** viva em
C++ (o JS só descrevendo mudanças, como a Unity faz com C#). Aí as três fases
migram juntas e a ponte deixa de ser paga por objeto. É projeto de meses, e
precisa de um ADR próprio — não de uma fatia.
