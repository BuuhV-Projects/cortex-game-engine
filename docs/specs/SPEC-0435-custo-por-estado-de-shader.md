# SPEC-0435 — Custo por estado de shader no export (luzes, sombra, grupos compartilhados)

**Data:** 2026-10-23
**Status:** medição em andamento — nenhuma alavanca implementada como padrão ainda.

Frente seguinte ao RS1 (SPEC-0425, ligado por padrão por decisão do usuário).
Correção do teto no ADR-0404: o que sobra do render não está mais no laço por
objeto, está no trabalho por **estado de shader**.

## Contexto (medido)

DDD 61 `e2be01c`, export com o RS1 ligado, Comercial, sonda de relógio temporária
(patch fora do repo: `D:/jogos/detetive-brasilia/.cortex/rs-ceiling/rs-state-split.patch`).
Por quadro, somando o caminho da b.1 e o do servidor (a mesma função
`prepararChamada`):

| item | andando | parado |
| --- | --- | --- |
| `updateBefore` (sombra e afins) | ~0,2–0,3 ms | ~0,15–0,4 ms |
| nós de render (luzes, câmera, tempo), por estado | ~1,2–1,3 ms | ~1,3–1,8 ms |
| grupos compartilhados (~21/quadro, ~80–125 µs cada) | ~2,6 ms | ~1,7–2,5 ms |

Rodadas ruidosas (n 48–55); vale a ordem de grandeza: **~3–4 ms por quadro, ~25%
do render**.

Por quê: no `three` 0.184 cada estado de shader (`NodeBuilderState`) tem as
próprias instâncias dos nós de luz e o próprio UBO do grupo compartilhado
"render" (o `groupsData` é indexado por grupo **e** `UniformsGroup` do estado).
Nada disso é deduplicado entre estados. O DDD 61 tem 8 `SpotLight` (6 postes +
2 faróis, no shader mesmo apagadas de dia), hemisfério e sol com sombra: ~70
uniformes de luz por estado, em espaço de câmera — andando, mudam todo quadro.

## Alavancas (cada uma: teto primeiro, depois A/B com autopiloto)

Regra do teto (ADR-0404, correção): o braço mantém o trabalho que continuaria
existindo; só remove o que a alavanca remove.

| | alavanca | onde | teto medido como |
| --- | --- | --- | --- |
| (a) | regravar a receita no lote da b.1 quando o grupo compartilhado foi recriado (hoje só ~26% dos diretos saem pelo lote) | engine (`DrawBatch.add`) | é a própria mudança, `?batchRecapture=0|1` |
| (b) | tirar do shader as luzes apagadas (postes e faróis de dia) | jogo | braço temporário no jogo: `SpotLight` fora da cena enquanto intensidade 0 |
| (c) | menos estados distintos (material compartilhado) | jogo/assets | censo dos estados por quadro e de quem os gera, antes de qualquer braço |
| (d) | um bloco único de uniformes de luz para todos os estados | engine (sistema de nós do `three`) | braço: deduplicar a atualização dos nós de luz por render |

Para (b): o jogo acende os postes à noite (`night` em degraus, SPEC-0120 do
jogo). A variante de shader sem as luzes tem de trocar sem travar: os dois
conjuntos de pipelines aquecidos no carregamento (`compileAsync`).

Depois de cada alavanca: sombra ligada × `?sombra=0` (decide se a sombra do sol
fica no export).

## Critério

Cada alavanca entra se o A/B com autopiloto (walk, Comercial e um segundo
ponto; 2 réplicas intercaladas) mostrar ganho de render e de p95/% > 33 ms sem
regressão nos outros pontos, com `?parityFreeze` no nível do controle. Mudança
no código do jogo vai para o usuário via a sessão principal.
