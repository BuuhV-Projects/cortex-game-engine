# ADR-0262 — Aquecimento de pipelines por quadro real, não por `compileAsync`

**Data:** 2026-09-24
**Status:** aceito

## Contexto

O `game.precompile()` chamava o `renderer.compileAsync(cena, câmera)` do three
para compilar os pipelines na tela de carregamento. A SPEC-0261 instrumentou o
que ele fez no kart-racer, numa volta a frio no export nativo:

- **Levou 7,9 s** para 547 objetos. O `compileAsync` cede a vez ao loop entre
  um objeto e outro (`yieldToMain`), e no host isso é ~um objeto por quadro.
- **Compilou a variante errada** dos materiais transparentes de duas faces. Ele
  enfileira o trabalho e o executa depois; o three desenha transparente
  `DoubleSide` em dois passes trocando `material.side` temporariamente
  (`BackSide`, depois `FrontSide`), e a fila adiada vê o valor já restaurado. O
  aquecimento compilava `side=2`; o jogo pedia `side=1` e `side=0`. O óleo e o
  vidro dos carros compilavam de novo em plena corrida — 118 a 167 ms num quadro.
- Compila para UM alvo (o contexto de render atual). Um jogo que também desenha
  por outro caminho (o borrão de velocidade do kart-racer desenha a cena num
  `pass()` próprio) recompila tudo na primeira vez que esse caminho liga.

As chaves de cache gravadas pela SPEC-0261 mostram exatamente essas diferenças:
dos 38 campos da chave, só variavam `side` (22) e o espaço de cor do alvo (25),
além dos ids de shader.

## Decisão

`game.precompile()` passa a **desenhar um quadro de verdade**: pede um quadro
de aquecimento ao loop e espera ele acontecer. Nesse quadro o `Game`:

1. força `visible = true` e `frustumCulled = false` em toda a cena ativa — o
   render pula o invisível e o que está fora da câmera, e é exatamente o que o
   aquecimento precisa alcançar (efeitos escondidos até o uso, pista fora de
   quadro);
2. desenha pelo **mesmo caminho do jogo**: o pós-processamento registrado com
   `setPostFX`, se houver, senão o render direto;
3. restaura visibilidade e culling, mesmo se o render lançar.

O quadro sai por baixo da UI da tela de carregamento. Com o loop parado
(`precompile` antes do `start`), desenha na hora.

Um render síncrono gera as MESMAS chaves que o jogo vai pedir, por construção —
inclusive os dois passes do transparente de duas faces. Não há lista de casos a
manter em sincronia com o three.

### Alternativas descartadas

- **Consertar o `compileAsync`** (reaplicar o `side` nos itens adiados): conserto
  dentro do three, frágil a cada versão, e continuaria levando segundos no host
  e compilando para um único alvo.
- **Aquecer num alvo fora da tela**: a chave inclui formato, amostras e espaço de
  cor do alvo. Um alvo diferente do que o jogo usa compila a variante errada —
  foi a terceira causa medida.

## Consequências

- O aquecimento leva um quadro, não segundos. O quadro é caro (a cena inteira,
  sem culling) e compila tudo de uma vez — por isso só faz sentido sob a tela de
  carregamento.
- O quadro é apresentado. Se a tela de carregamento não cobrir a tela toda, o
  jogador vê um quadro da cena com tudo visível. A tela de carregamento do jogo
  precisa ser opaca.
- O caminho de render que o jogo escolhe DENTRO do seu `setPostFX` é do jogo: um
  efeito que só liga acima de uma velocidade precisa ser forçado pelo jogo e
  aquecido com uma segunda chamada. A engine não tem como adivinhar esse estado.
- Pipelines de objetos criados DEPOIS do aquecimento continuam nascendo na hora
  (ex.: um `InstancedMesh` novo gera um shader de vértice próprio). Criar esses
  objetos no carregamento continua sendo do jogo.
- `Renderer.precompile` (o `compileAsync`) continua existindo para quem o chama
  direto; só o `Game.precompile` muda.
- **Pendente:** o `buildScene` também chama o `compileAsync` ao fim da montagem
  (`precompile` ligado por padrão), com o mesmo defeito e o mesmo custo de
  segundos no host. Não muda aqui porque o `buildScene` não tem o loop do `Game`
  para pedir um quadro; o jogo que chama `game.precompile()` depois já cobre a
  cena montada. Revisar quando houver medida do custo dele no carregamento.
