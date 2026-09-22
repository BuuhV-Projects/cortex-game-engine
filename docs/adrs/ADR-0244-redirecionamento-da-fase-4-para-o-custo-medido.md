# 0244 - Redirecionamento da fase 4 para o custo medido

**Data:** 2026-09-22
**Status:** aceito — substitui a ordem e o alvo dos marcos M5 e M6 do ADR-0237

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
