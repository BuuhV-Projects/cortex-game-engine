# SPEC-0243 — Mapa de custo do render do kart-racer

**Data:** 2026-09-22
**Status:** aceito

## Contexto

O ADR-0237 planejou a fase 4 em marcos, com o **M5** (submissão nativa do passe
principal) antes do **M6** (passe de sombra nativo com CSM). O M5 foi executado
e, na remedição com método correto, **não entregou ganho** (SPEC-0241).

Isso obrigou a medir de novo, do zero, **onde o tempo de render é gasto** — em
vez de assumir a distribuição que o plano supunha.

## Método

`?bench&hold` (cena congelada — a variante feita para comparação fina), métricas
ligadas, medianas de ~140 amostras, **mesma build** em todos os cenários.
Comparações sem `hold` foram descartadas: a IA pilotando cobre trechos
diferentes da pista e a variância domina diferenças desta ordem.

Interruptores temporários criados para medir: `?semSombras=1`,
`?sombraSoDinamicos=1`, `?cascatas=N`, `?nativePassControle=1`.

## O que foi medido

| cenário | `cpu.render` | draws |
| --- | --- | --- |
| baseline | 12,80 ms | 261 |
| passe nativo com 40 malhas (M5) | 13,40 ms | 214 |
| sombra do cenário estático desligada | 11,90 ms | 220 |
| **sem sombras** | **8,80 ms** | 195 |
| cascatas = 2 | 16,20 ms | 316 |
| cascatas = 3 | 18,90 ms | 373 |

## Decisão — o mapa de custo

Dos 12,80 ms de `cpu.render`:

- **~4,0 ms são as sombras** (31%). É o maior item isolado.
- **O M5 não tem ganho a extrair.** O `mergeStaticScene`, ligado por padrão no
  host, funde **1312 malhas em 61 grupos** (+40 mantidas). O passe principal já
  quase não tem custo por objeto, e o M5 estava migrando justamente as 40 que o
  merge não conseguiu fundir.
- **As cascatas já estão no mínimo.** O `level.json` do kart-racer usa
  `shadowCascades: 1`. Cada cascata a mais custaria ~3 ms e ~57 draws — o
  número está certo e não há alavanca aqui.

### O custo da sombra NÃO está nos draws

É o achado que muda o plano. Desligar `castShadow` do cenário estático remove
**41 dos 66 draws** de sombra e devolve apenas **0,9 ms**. Desligar o shadow map
inteiro remove 66 draws e devolve **4,0 ms**.

Se o custo fosse proporcional aos draws, 41 deles valeriam ~2,5 ms. Valem 0,9.
Logo a maior parte dos 4,0 ms é **overhead do sistema de sombra** — o
`CSMShadowNode` recalculando frusta, matrizes e render list por frame, em JS
sobre Hermes sem JIT — e não a submissão dos draws.

## Decomposição medida do custo da sombra (2026-09-22)

A conta acima ("~4,0 ms de sombra") foi aberta com a sonda de fases
(`?renderPhases=1`), mesma build, `?bench&hold`, medianas de ~200 amostras:

| fase | com sombras | sem sombras | delta |
| --- | --- | --- | --- |
| `render` | 15,10 ms | 9,30 ms | **−5,80** |
| `rpProject` (travessia + culling + RenderList) | 3,39 ms | 1,75 ms | **−1,64** |
| `rpObjects` (laço por objeto) | 9,76 ms | 5,80 ms | **−3,96** |
| `rpCallsProject` (nº de travessias no frame) | **4** | **3** | −1 |

> Os valores absolutos são maiores que os 12,80 ms do baseline porque a própria
> sonda custa ~2,3 ms. O que vale aqui são os **deltas**.

**O que isso estabelece:**

1. **O shadow pass faz uma travessia completa da cena a mais** — `rpCallsProject`
   cai de 4 para 3 ao desligar a sombra. Ela custa **1,64 ms**.
2. **O laço por objeto do shadow pass custa 3,96 ms** — mais que o dobro da
   travessia, e é o maior item isolado da sombra.
3. **Não há custo relevante de setup/teardown de passe:** 5,80 − 1,64 − 3,96
   deixa ~0,2 ms. Uma estimativa anterior de ~1,1 ms, obtida por subtração, não
   se confirma.

**Consequência:** o alvo é o par travessia + laço do shadow pass, que juntos são
**5,6 dos 5,8 ms**. Como `castShadow` só é consultado dentro do laço (e não na
travessia nem na montagem da RenderList), objetos que não projetam sombra são
percorridos, culados, enfileirados e **só então** descartados — pagando quase
todo o custo sem produzir pixel.

## Consequências

- **O M5 não se justifica nesta cena.** Não deve receber mais trabalho (shader
  real, pool de uniformes, oclusão) sem uma cena onde o custo por objeto no
  passe principal seja demonstrado.
- **O M6, como está no ADR-0237, mira o alvo errado.** Um passe de sombra
  nativo baratearia os 66 draws, que valem ~1,5 ms pela medição — não os 4,0 ms
  que o marco promete. O alvo certo é o **overhead do CSM por frame**.
- **Caminhos a avaliar, em ordem de custo:** reduzir a frequência de
  recomputação das cascatas (elas não precisam ser refeitas todo frame com a
  câmera quase parada); simplificar o `CameraFollowingCSM`; e, só então,
  considerar levar essa atualização para C++.
- Bakear a sombra do cenário estático **não compensa sozinho**: 0,9 ms, dentro
  da faixa em que o baseline oscila entre rodadas (12,80 a 13,60 ms).

## Pendência conhecida

Os dois contadores de draws divergem: o do trace cai 47 com o passe nativo
(`visible = false`) mas não muda no controle (`castShadow = false`), e a
contagem por pass do host atribui 234 draws ao shadow map. **Nenhuma das duas
contagens deve ser usada para concluir** até a divergência ser resolvida. Os
tempos, sim, são confiáveis: vêm da métrica oficial com a cena congelada.
