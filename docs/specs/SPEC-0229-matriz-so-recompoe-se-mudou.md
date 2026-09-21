# 0229 - Matriz local só recompõe se mudou

**Data:** 2026-09-20
**Status:** rejeitado — implementado, medido e revertido

## Contexto

O ADR-0228 fechou a migração do render para C++ e deixou uma única alavanca de
código aberta: **não percorrer/recompor o que não mudou**. A SPEC-0227 mediu o
teto dela, no `kart-racer`, com a cena parada e os mesmos 383 draws:

| | render | fase de matriz |
| --- | --- | --- |
| travessia livre | 22,6 ms | 4,75 ms |
| só o compose desligado | 19,2 ms | 1,33 ms |
| compose + descida congelados | 17,5 ms | 0,21 ms |

Ou seja: **recompor a matriz local é 72% do custo da fase** (3,4 ms, 15% do
render), e é a metade segura — desligar a descida na árvore é que prega objeto
no lugar.

O que torna isto interessante não é o `hold`, é a **corrida**: medido com o
contador de matrizes inalteradas do trace, **1.257 dos 1.320 nós (95,2%) têm a
matriz local idêntica de uma amostra para outra**. Só **63 nós** mudam de fato —
as raízes dos 6 carros e os pivôs das rodas. É o esperado: um carro se move pela
raiz, e as peças internas do modelo nunca mexem no transform local.

Ou seja, o `three` recompõe ~1.257 matrizes por frame para chegar exatamente no
mesmo resultado.

## Decisão

Trocar a política por uma **verificação de valor**. Em vez de desligar
`matrixAutoUpdate` em subárvores (o que exige um contrato novo com todo mundo
que escreve transform — sistemas do ECS, animação, e o `syncVehicle` do próprio
`kart-racer`, que escreve nos pivôs das rodas), o `updateMatrix` passa a
comparar `position`/`quaternion`/`scale` com o último valor visto e **só
recompõe quando mudou**.

```
updateMatrix():
  se position, quaternion e scale forem iguais aos últimos vistos:
    retorna sem fazer nada
  senão:
    compose() e marca matrixWorldNeedsUpdate, como sempre
```

Duas propriedades importantes desse desenho:

1. **Não há contrato novo.** Quem escreve transform continua escrevendo do mesmo
   jeito; a checagem é de **valor**, não de flag. Um sistema que mexe num objeto
   sem avisar ninguém continua funcionando — que é justamente o caso em que
   desligar `matrixAutoUpdate` produziria um objeto pregado no lugar, o tipo de
   bug visual intermitente mais caro de rastrear.
2. **O ganho é duplo.** Pulando o `compose`, o `matrixWorldNeedsUpdate` também
   não é marcado — e o `updateMatrixWorld` do `three` usa essa flag para decidir
   se refaz a matriz de mundo. Some o compose **e** a multiplicação de mundo do
   nó, o que alcança parte da descida sem o risco dela.

Fica atrás de `?matrixDirtyCheck=1` enquanto está sendo medido. Se o A/B
confirmar o ganho, vira o padrão e a flag passa a servir para **desligar**
(`=0`), que é o que um jogo precisaria se algum dia escrever transform por um
caminho que a comparação não enxergue.

## O que pode dar errado (e como fica coberto)

- **A comparação custar quase tanto quanto o compose.** São 10 números contra um
  `compose` (que escreve 16 e faz ~40 operações), mas no Hermes sem JIT o acesso
  a propriedade é caro e a margem pode ser menor do que parece. **É o risco
  principal e é exatamente o que o A/B mede** — se não pagar, esta spec vira
  "rejeitado — medido" como a SPEC-0012 do jogo.
- **Alguém escrever direto em `obj.matrix`** (sem passar por
  position/quaternion/scale) e ser sobrescrito. Já hoje isso só funciona com
  `matrixAutoUpdate = false`; nesse caso a guarda nem roda.
- **Escrever transform, ler `matrixWorld` no mesmo frame** continua igual: a
  mudança foi detectada e o compose aconteceu.

## Como medir

Mesmo método da SPEC-0227, que não vou repetir por inteiro: `?bench&hold` e
`?bench`, medianas, `draws` conferidos entre os lados, custo do instrumento
descontado. Os dois lados são `renderPhases=1` com e sem `matrixDirtyCheck=1`.
O que tem de cair é `cpu.rpMatrix` e, junto, o `cpu.render`.

## Resultado: a guarda funciona, o ganho não aparece no frame

**Na cena parada** (`?bench&hold`, 383 draws dos dois lados — controle
perfeito), o ganho é grande:

| | render | fase de matriz |
| --- | --- | --- |
| sem a guarda | 23,20 ms | 4,82 ms |
| com a guarda | **19,45 ms** | 2,81 ms |

**Na corrida, não.** Como os dois builds não percorrem a pista igual, a
comparação foi feita por **faixa de draws** (o método que desmascarou a
SPEC-0012 do jogo), e repetida com a **ordem das rodadas invertida** para
separar efeito de ruído de máquina:

| medida | 1ª rodada | réplica invertida |
| --- | --- | --- |
| `cpu.rpMatrix` | −16% a −20% | −21% a −27% |
| `cpu.render` | **+3% a +5%** | **−15% a +4%** |

A fase que a guarda ataca cai de forma **consistente e reprodutível** nas duas
réplicas. O `render` total **muda de sinal entre elas** — ou seja, é ruído: o
ganho real na corrida é ~1 ms num render de ~30 ms (≈3%), que fica abaixo da
variação entre rodadas (medida em 5-15%).

Por que o `hold` prometia 16% e a corrida entrega 3%: com a cena parada, **todo
nó** é pulado e a fase inteira some; na corrida, os nós que mudam pagam a
comparação **além** do compose, e o `world` chama `updateMatrixWorld` várias
vezes por frame (substeps de física), onde a guarda é custo sem economia.

## Decisão final

**Não adotar.** Um patch global em `Object3D.prototype.updateMatrix` vale para
todos os jogos da engine e cria uma classe nova de bug sutil (quem escreve em
`obj.matrix` direto, quem depende do `matrixWorldNeedsUpdate` ser remarcado).
Três por cento do render — que sequer é distinguível do ruído no frame — não
compra esse risco.

Fica o número, que é o que interessa para a próxima pessoa: **95% dos nós têm
transform parado, e mesmo assim otimizar por nó rende pouco.** É mais uma
evidência na mesma direção do ADR-0228: o caminho não é fazer o trabalho por
objeto ficar mais barato, é **ter menos objetos**.
