# 0213 - Fusão de malhas dentro de um modelo (`mergeSubtree`)

**Data:** 2026-09-19
**Status:** aceito

## Contexto

Modelos 3D de catálogo vêm com cada peça separada: um carro tem para-choque,
grade, faróis, retrovisores, bancos, painel e maçanetas como malhas próprias.
Cada uma é uma **draw call**, e nenhuma delas se move em relação ao corpo.

Medido no kart-racer (`perf-trace.jsonl`, SPEC-0198) com a cena de largada:

| objeto       | malhas | triângulos |
| ------------ | ------ | ---------- |
| `gol-g3`     | 124    | 248.732    |
| `golf-gti`   | 92     | 359.568    |
| `classic-ss` | 32     | 381.848    |
| **soma**     | **248** | **990.148** |

São **248 das 642 malhas desenhadas** — quase 40% dos objetos da cena para três
carros, e ~31% dos triângulos.

O engine já tem o {@link mergeStaticScene} (SPEC-0120), mas ele não serve aqui,
por duas razões de desenho:

1. Ele **exclui entidades dinâmicas** de propósito — e o carro é uma: ele anda.
   Fundir o carro na cena o congelaria no lugar.
2. Ele funde em **espaço de mundo**, o que só faz sentido para o que nunca se
   move.

O que falta é o caso oposto: fundir as peças **dentro** de um objeto que se move,
no espaço local dele, preservando as partes que precisam continuar independentes.

## Decisão

Uma função nova no mesmo módulo, `mergeSubtree(root, options)`: funde as malhas
descendentes de `root` agrupando **por material**, bakeando a geometria no
espaço **local de `root`**, e pendura o resultado como filho direto de `root`.

O objeto `root` continua sendo o mesmo objeto, na mesma posição, com o mesmo
pai — quem o move (física, animação, editor) não percebe diferença.

```ts
// O corpo do carro vira poucas malhas; os pivôs de roda seguem independentes.
mergeSubtree(carro, { preserve: rodas, name: 'car-body' });
```

### `preserve`: onde a fusão para

Cada subárvore listada em `preserve` é pulada inteira — nem as malhas dela nem
as dos descendentes entram na fusão. É o que mantém girando o que gira: os
quatro pivôs de roda do carro, uma torre que rotaciona, uma porta que abre.

### Agrupamento

A chave de grupo é a mesma do merge estático, e pela mesma razão: material,
assinatura de atributos (o `mergeGeometries` exige atributos iguais), sombra e
`renderOrder`. Um grupo de uma malha só não é fundido — não há ganho, e o bake
custaria uma cópia de geometria.

**A chave inclui também `userData.cortexOrigMaterial`.** Esse campo é como o
`applyMaterial` (SPEC-0196) lembra de qual material o preset veio, e é por ele
que o jogo identifica, por exemplo, qual material é a pintura do carro. Sem isso
na chave, a malha fundida poderia perder a identidade da origem e a troca de cor
pararia de achar a pintura. O valor do grupo é copiado para a malha fundida.

### O que fica de fora

Malha com esqueleto (`SkinnedMesh`), multi-material, geometria sem atributos
compatíveis e qualquer descendente de um `preserve`. Nesses casos a malha fica
exatamente como estava — a função nunca faz um objeto sumir.

## Consequências

- **Menos draw calls por modelo**, sem tocar em como o objeto é movido. Vale nas
  duas pilhas de render (Studio/Chromium e host nativo), porque o ganho é de
  contagem de objetos, não de API gráfica.
- **Não atrapalha o editor.** As sub-malhas de um `.glb` não são nós autorados
  (`cortexSceneNode`): o editor seleciona o objeto inteiro, não o para-choque.
  Por isso este merge pode rodar no Studio, diferente do merge estático, que
  fica desligado lá justamente para não fundir nós autorados entre si.
- **A geometria original é substituída**: quem guardava referência a uma malha
  interna pelo nome precisa listá-la em `preserve`. É a razão de `preserve`
  existir e de a função não ser automática.
- A fusão é **uma vez**, depois de os materiais finais estarem aplicados. Chamar
  antes do `applyMaterial` agruparia pelos materiais errados.
- Não há caminho de volta (não existe `unmerge`): para variantes trocáveis, funda
  **cada variante** separadamente e alterne a visibilidade, que é o que o
  kart-racer faz com as rodas de garagem.

## Correção de tabela junto: `collectVisible` respeita visibilidade herdada

Medindo o antes/depois apareceu um defeito na própria ferramenta: o
`collectVisible` do perf trace (SPEC-0198) usava `Object3D.traverse`, que
percorre a árvore inteira, e filtrava só o `visible` da própria malha. Mas o
`visible` do three é **herdado**: malha `visible: true` dentro de um pai
escondido não desenha.

No kart-racer isso inflava o número: as variantes de roda da garagem ficam todas
na cena, com só um modelo visível, e as escondidas entravam na conta como se
desenhassem. A coleta virou uma travessia própria que **para** na subárvore
invisível.

## Resultado medido

kart-racer no host nativo, mesma cena de largada, A/B na mesma máquina e no
mesmo momento (mediana de ~80 amostras estáveis, descartados os 10 s iniciais de
carregamento):

| | antes | depois |
| --- | --- | --- |
| fps | 19 | **32** (1,68×) |
| frame | 52 ms | **31 ms** |
| CPU de render | 52 ms | **30 ms** (−42%) |
| draw calls | 626 | **496** |

O A/B foi feito exportando as duas versões em sequência, porque comparar com uma
medição de outro momento já enganou antes nesta mesma cena (um baseline com uma
amostra só, colhido enquanto o jogo ainda carregava, sugeriu 10 fps).

## Validação

`tests/scene/mergeSubtree.test.ts`:

- funde duas malhas de mesmo material numa só, somando os triângulos;
- materiais diferentes não se misturam (um grupo cada);
- `preserve` mantém a subárvore intacta, inclusive descendentes;
- a geometria fundida fica no espaço LOCAL da raiz: mover a raiz depois move o
  resultado junto, e o bake respeita a transformação de cada peça;
- `SkinnedMesh` e multi-material são mantidos como estavam;
- grupo de uma malha não é fundido;
- `cortexOrigMaterial` entra na chave e é preservado na malha fundida.
