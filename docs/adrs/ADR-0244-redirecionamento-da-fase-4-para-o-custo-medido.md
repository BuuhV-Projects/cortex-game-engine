# 0244 - Redirecionamento da fase 4 para o custo medido

**Data:** 2026-09-22
**Status:** aceito com a decisão 2 REVOGADA em 2026-09-22 (ver o fim do documento)

## Contexto

O ADR-0237 planejou a fase 4 em marcos, apoiado num diagnóstico da época: o
`renderObject` do `three` custava **15,7 ms dos 18,5 ms de render (85%)**, e
portanto tirar a submissão por objeto do JS era o caminho.

O **M5** (submissão nativa do passe principal) foi executado. Na medição com
método correto — mesma build, `?bench&hold`, medianas de ~140 amostras — ele
**não entregou ganho**: 13,40 ms contra 13,60 ms do baseline, dentro do ruído,
e pior que o controle (13,10 ms). O detalhe do que foi medido, e do erro de
método que produziu o número anterior de 34 µs/draw, está na SPEC-0241.

Isso obrigou a medir de novo **onde o tempo é gasto**, em vez de seguir o plano
pela premissa. O resultado está na SPEC-0243.

## O que mudou desde o ADR-0237

O diagnóstico que sustentava o plano **não vale mais para esta cena**, por uma
razão concreta: o `mergeStaticScene` (ligado por padrão no host nativo) funde
**1312 malhas em 61 grupos**, mais 40 mantidas. O custo por objeto do passe
principal — o alvo do M5 — foi em boa parte eliminado por outro caminho, antes
de a fase 4 chegar nele. O M5 acabou migrando justamente as 40 malhas que o
merge não conseguiu fundir.

O mapa de custo medido dos 12,80 ms de `cpu.render`:

| item | custo |
| --- | --- |
| sombras | **~4,0 ms (31%)** — maior item isolado |
| passe principal | sem ganho extraível |

E o ponto que redefine o M6: **o custo da sombra não está nos draws**. Desligar
`castShadow` do cenário estático remove **41 dos 66** draws de sombra e devolve
**0,9 ms**; desligar o shadow map inteiro remove 66 e devolve **4,0 ms**. Se o
custo fosse proporcional aos draws, 41 deles valeriam ~2,5 ms.

## Decisão

1. **O M5 é encerrado sem merge.** O código fica na branch
   `feat/m5-submissao-nativa` como registro. Não recebe shader real, pool de
   uniformes nem a correção de oclusão. Voltar a ele exige primeiro demonstrar,
   com medição, uma cena em que o custo por objeto do passe principal exista.

2. **O M6 muda de alvo.** Deixa de ser "passe de sombra nativo (CSM)" e passa a
   ser **"reduzir o overhead do CSM por frame"**. Um passe de sombra nativo
   barateia os 66 draws, que valem ~1,5 ms pela medição — não os 4,0 ms que o
   marco prometia. O custo está no `CSMShadowNode` recalculando frusta,
   matrizes e render list **todo frame**, em JS sobre Hermes sem JIT.

3. **Ordem de ataque do novo M6**, do mais barato ao mais caro:
   - não recomputar as cascatas a cada frame (com a câmera quase parada, elas
     não mudam);
   - simplificar o `CameraFollowingCSM`;
   - só então considerar levar essa atualização para C++.

4. **Não bakear a sombra do cenário como medida isolada:** 0,9 ms está dentro
   da faixa em que o baseline oscila entre rodadas (12,80 a 13,60 ms).

## Alternativas consideradas

- **Seguir o M5 até o fim** (shader real, oclusão): rejeitado. O ganho medido é
  zero nesta cena, e os itens restantes são os mais caros do marco.
- **Fazer o M6 como estava escrito** (passe de sombra nativo): rejeitado por
  ora. Ataca ~1,5 ms dos 4,0 ms, com o custo e o risco de precisão que o
  próprio ADR-0237 já apontava (as bandas da SPEC-0234).
- **Abandonar o `three` e ir 100% nativo**: rejeitado. O gargalo medido é
  overhead de um subsistema específico, não a linguagem; e o `three` aqui
  sustenta o editor, a cena data-driven e o jogo, todos em TypeScript.

## Consequências

- O alvo de 60 fps do ADR-0237 continua de pé; muda o caminho até ele.
- Os critérios numéricos dos marcos M5 (`≤ 10 ms`) e M6 (`≤ 8 ms`) ficam sem
  efeito na forma escrita: foram derivados de uma distribuição de custo que a
  medição não confirmou.
- Os interruptores de medição temporários (`?semSombras`, `?cascatas`,
  `?sombraSoDinamicos`, `?nativePassControle`) devem sair antes de qualquer
  merge na `main`.
- Fica registrado que **comparação fina exige `hold` e a mesma build**: sem
  isso a variância da pilotagem domina, e foi o que produziu o número errado de
  34 µs/draw.

## Correção de 2026-09-22 — a decisão 2 deste ADR estava errada

A decisão 2 afirmou que um passe de sombra nativo atacaria **~1,5 ms dos
4,0 ms**. Esse número veio de extrapolar "41 draws valem 0,9 ms" para os
**66 draws** que o contador do trace mostrava. **A premissa estava errada:** a
cena tem **449 casters** (censo do grafo), e o contador de draws do trace não
reflete os draws do passe de sombra — é a mesma divergência de contadores que a
SPEC-0243 já mandava não usar, e eu usei assim mesmo.

Com o isolamento correto (`?semCasters=1`, que desliga só `castShadow` e mantém
material e `receiveShadow`):

| cenário | `render` | `rpCallsProject` |
| --- | --- | --- |
| baseline | 15,10 ms | 4 |
| sem casters | 9,60 ms | 3 |

**O passe de sombra custa ~5,5 ms**, não 1,5 — e some por inteiro quando não há
caster (`rpCallsProject` cai de 4 para 3). Dividido pelos 449 casters, dá
**~12 µs por caster**, coerente com os 33,5 µs/draw do passe principal em JS
medidos na SPEC-0227.

**Nenhuma alavanca barata funciona**, todas medidas:

| tentativa | ganho |
| --- | --- |
| cascatas de 3 → 1 | já está em 1 (`level.json`) |
| `castShadow=false` nos 61 grupos estáticos | 0,9 ms |
| `casterMinRatio` de 0,15 → 0,6 | 0,3 ms |
| compactar o esqueleto do grafo (335 nós vazios) | não medido; ataca `rpProject`, que é 1,64 ms dos 5,5 |

O custo está **distribuído** pelos 449 casters, sem subconjunto pequeno que
domine. Reduções parciais dão ganhos proporcionais e pequenos; para ganhar de
verdade seria preciso cortar casters em massa, o que muda a aparência.

**Portanto o M6 como o ADR-0237 escreveu — passe de sombra nativo — é o
caminho certo.** O custo é por caster, e é exatamente isso que o C++ barateia:
o spike do ADR-0232 mediu 2,2 µs/draw em C++ contra 33,5 µs/draw em JS. A
449 casters, sair de ~12 µs para a ordem de 2 µs vale a maior parte dos 5,5 ms.

**Fica revogada a decisão 2 deste ADR.** A decisão 1 (encerrar o M5) e a
decisão 3 (a hipótese do CSM caro é falsa) **permanecem** — a segunda foi
confirmada de forma independente pela leitura do `CSMShadowNode`, que com uma
cascata não aloca nada por frame e não recomputa frusta.
