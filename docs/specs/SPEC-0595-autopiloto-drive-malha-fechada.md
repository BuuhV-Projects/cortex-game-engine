# SPEC-0595 — autopiloto `drive` em malha fechada (condutor do jogo)

**Data:** 2026-10-25
**Status:** aceito

Item 2 de "O que falta para fechar o R1" (PRD-0466). Estende a SPEC-0414 (autopiloto de entrada) e o
kit de medição (SPEC-0382).

## Contexto

O `--autopilot drive` da SPEC-0414 não dirige. Medido em `r1-accept/drive/helio-*`: velocidade mediana
de 1,7 m/s e só 4% das amostras acima de 9 m/s. Numa sessão real do usuário com o carro, 44% das
amostras passaram de 9 m/s, e o jogo travou. Os A/B de direção nunca cobriram esse regime.

Causa, lendo o perfil (`autopilotProfiles.ts`): ele é em **malha aberta**. Acelera só 3 s e depois
esterça no batente por 4 s para cada lado, o que dá círculos em baixa velocidade e batida no que estiver
perto. Depois freia, dá ré e aperta Y duas vezes, ficando ~4,5 s fora do carro. Nada segue a rua nem
desvia. No DDD 61, o `&drive=1` ainda põe o carro no ponto de spawn com o yaw do jogador; no Setor O, ele
nasce de frente para a calçada (backlog do PRD-0009: "perfil `drive` sem desvio" e "Setor O (&drive=1)
o carro nasce de frente para a calçada").

Um perfil de passos temporizados não tem como dirigir: dirigir exige saber onde fica a rua, e quem sabe
é o jogo.

## Decisão

### Engine — passo `driver` e condutor registrado

- `AutopilotStep` ganha `driver?: true`. Nesse passo, a cada `step(dt)` o autopiloto chama o
  **condutor** registrado e escreve no controle virtual `leftX = steer`, `RT = throttle` e
  `LT = brake` (valores em 0..1, `steer` em −1..1, limitados). Os outros botões e eixos do passo
  continuam valendo.
- API pública: `setAutopilotDriver(driver: AutopilotDriver | null)`, com
  `AutopilotDriver = (dt: number) => { steer: number; throttle: number; brake: number }`. O jogo
  registra; a engine não sabe nada de ruas.
- Sem condutor registrado, um passo `driver` **solta tudo** (pad neutro) e registra uma vez em
  `debug('perf')` `[autopilot] passo driver sem condutor registrado`. A regra de validade do kit
  reprova a rodada (não anda), em vez de medir um carro parado como se fosse "dirigindo".
- Perfis embutidos: `drive` passa a ser um único passo `driver` (o condutor decide tudo).
  O antigo vira `drive-legacy`, mantido só como caso de resposta conhecida da regra abaixo.

### Jogo (DDD 61, registro próprio no `docs/specs` do jogo)

Condutor "coelho": um `Driver` do `chaseDriver.ts` (o mesmo do fugitivo e do tráfego) corre pelas ruas
na faixa da direita, na velocidade da via (`speedLimit`), com o desvio de obstáculos que o tráfego já
usa. Ele espera quando o carro do jogador fica para trás. O carro do jogador o persegue pelo controle
virtual (perseguição pura):
volante proporcional ao ângulo até o coelho, acelerador para manter a distância-alvo e freio quando o
ângulo é grande ou o coelho parou. No início, o carro é posto na faixa do coelho, alinhado ao trecho, o
que resolve o spawn de frente para a calçada. Preso (sem progresso por alguns segundos), o condutor dá
ré esterçando para o lado oposto e recoloca o coelho à frente.

### Kit — regra de validade do perfil `drive`

`trace-stats.mjs` calcula, para rodadas com autopiloto, a partir das amostras da câmera depois do
aquecimento: o **caminho percorrido** (soma dos trechos entre amostras consecutivas), a velocidade de
cada intervalo, a velocidade mediana e o % de intervalos acima de 9 m/s. Para o perfil `drive`, a
rodada é **inválida** com menos de **40%** dos intervalos acima de 9 m/s ou caminho abaixo de
**400 m** (na janela de 135 s do kit, depois dos 30 s de aquecimento). Caso de resposta conhecida: o
`drive-legacy` reprova nessa regra.

Resumo de uma linha: `native/scripts/perf/drive-stats.sh <rodada...>` (velocidade mediana, % > 9 m/s,
caminho).

## Consequências

- Os A/B de direção passam a cobrir o regime em que o usuário travou (> 9 m/s em quase metade do tempo).
- O perfil depende do jogo registrar um condutor; outro jogo sem condutor tem rodada `drive` inválida (é
  o comportamento desejado: não medir um carro parado como "dirigindo").
- O `drive-legacy` fica só como resposta conhecida; não é para medir.

## Testes

- Vitest (engine): passo `driver` escreve `leftX`/`RT`/`LT` a partir do condutor, com limites;
  sem condutor, pad neutro; `drive` é um passo `driver`; `drive-legacy` é o perfil antigo;
  `trace-stats`: caminho, velocidades e a regra do `drive` (legado reprova, rodada rápida passa).
- Jogo: Vitest do condutor (persegue o coelho, freia em curva, dá ré quando preso).
- Medição: `validate.sh` com `--autopilot drive` no Hélio e no Comercial passa a regra; o
  `drive-legacy` reprova.

## Resultado (2026-10-25)

Engine nesta branch + DDD 61 na branch `claude/autopilot-drive` do jogo (SPEC-0199 do jogo),
`--autopilot drive --extra '&drive=1'`, 1080p, `drive-stats.sh`/`validate.sh`:

| rodada | v mediana | > 9 m/s | caminho | veredito |
| --- | --- | --- | --- | --- |
| `drive` Hélio | 11,4 m/s | 62% | 534 m | VÁLIDO |
| `drive` Comercial | 13,3 m/s | 70% | 499 m | VÁLIDO |
| `drive-legacy` Setor O | 0,2 m/s | 26% | 256 m | INVÁLIDO |
| `drive-legacy` Comercial | 0,2 m/s | 30% | 283 m | INVÁLIDO |
| `r1-accept/drive/helio-*` (perfil antigo, 4 rodadas) | 1,5–1,7 m/s | 4–6% | 175–220 m | INVÁLIDO |

Ressalva sobre a resposta conhecida: com o jogo atual, o `drive-legacy` **no Hélio** passa (12,4 m/s,
62%, 629 m). A avenida é longa e reta, e o roteiro alterna esquerda e direita por igual, então ele
quase anda reto. O caso conhecido vale no Setor O e no Comercial, e nas rodadas históricas do
`r1-accept`. A regra mede o regime de velocidade, não se o caminho foi bem escolhido.

Na integração, deu errado e foi corrigido no condutor do jogo: (1) a pose do carro lida logo depois do
`vehicle.reset` ainda era a antiga (a malha sincroniza no quadro seguinte), então o condutor passou a
ser semeado com o ponto do spawn; (2) o coelho, nascido em cima do carro, via a caixa do carro do
jogador no campo do trânsito e não saía, então passou a nascer `LEAD` metros à frente e a ignorar essa
caixa.

## Revisão 1 (2026-10-25) — dirigir dentro da cidade, com a câmera livre

Duas correções do usuário. A primeira: "nos testes você dirige no meio do mato com árvores em vez de
dirigir dentro da cidade". No Hélio, o piloto rodava na borda (x 430..615, z −690..−1048), com quase só
prédios estáticos; a sessão real foi no miolo (x −200..80, z −105..99), com trânsito, pessoas e
interiores na vista. A segunda: "a câmera está apontando pra baixo pegando apenas o carro". O piloto
tinha −33° de mediana, ~88% das amostras abaixo de −30° e a câmera a 5,9 m; a sessão real tem −21°, 1%
abaixo de −30° e 4,0 m.

### Engine

- **Medidores do jogo no trace:** `setPerfTraceGauge(nome, ler | null)` (`PerfTrace.ts`, público). Cada
  amostra grava `game: { nome: valor }`; sem medidor registrado, o campo não aparece.
- **Câmera ao vivo:** a chase cam (`VehicleControlSystem`) reaplica `options.camPitch` quando o valor
  muda. Antes, ela lia o valor uma vez, no 1º quadro, e com o autopiloto ligado esse quadro podia vir
  antes de o jogo escolher o dele (uma das rodadas saiu com a inclinação padrão).

### Kit — regras do perfil `drive` (todas juntas no motivo da reprovação)

| regra | critério | fonte |
| --- | --- | --- |
| velocidade | ≥ 40% dos intervalos > 9 m/s e ≥ 400 m de caminho | câmera |
| (a) cidade | ≥ 80% das amostras com `game.urban` = 1 | medidor do jogo (caixas dos bairros pelo grafo de ruas) |
| (b) densidade | `tris` e `draws` medianos ≥ 90% dos da sessão real (1 450 290 e 147) | trace |
| (c) trânsito | ≥ 50% das amostras com `game.trafficMoving` ≥ 1 | medidor do jogo (carro do trânsito > 2 m/s, no frustum, a ≤ 100 m) |
| câmera | inclinação mediana (`asin(cam.dy)`) entre −25° e −10°, e ≤ 10% das amostras abaixo de −30° | trace |

Uma rodada `drive` sem os medidores do jogo reprova (jogo sem a SPEC-0199 do jogo). A referência de (b) é o
trace da sessão real do usuário (`builded-ddd-61/perf-trace.jsonl`, janela depois dos 30 s).

Casos de resposta conhecida: as rodadas `wb-ranges/three-drive`, `wb-repro2/native-drive` e
`frente-d-faixas/drive-nativo` reprovam na câmera (−33°, 83–86% abaixo de −30°, 5,9 m). O
`drive-legacy` no Hélio, que passava nas regras de velocidade, reprova em (a) (0% na cidade) e em (c)
(5% com trânsito à vista).

Em Águas Claras, a carga é longa e o relógio do jogo anda mais devagar que o de parede. Numa rodada de
135 s, a janela depois do aquecimento ficou com ~24 s, e o caminho, abaixo de 400 m, mesmo a 14 m/s. Lá a
rodada usa `--secs 220`, sem afrouxar a regra.

### Resultado da revisão 1 (2026-10-25)

Engine nesta branch e jogo na `claude/autopilot-drive`, `--autopilot drive --extra '&drive=1&hora=18'`
(pico da tarde; a hora padrão é 17,5), 1080p; Águas Claras com `--secs 220`:

| rodada | v med | > 9 m/s | caminho | cidade | trânsito | tris / draws | câmera | veredito |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Comercial r1 | 10,6 | 54% | 596 m | 100% | 69% | 2,60 M / 144 | −20°, 0% < −30°, 3,8 m | VÁLIDO |
| Comercial r2 | 7,6 | 31% | 428 m | 100% | 60% | 2,70 M / 150 | −20°, 0%, 3,8 m | velocidade |
| Centro r1 | 9,1 | 52% | 576 m | 100% | 66% | 1,80 M / 147 | −20°, 0%, 3,8 m | VÁLIDO |
| Centro r2 | 9,1 | 51% | 636 m | 100% | 61% | 1,72 M / 165 | −20°, 0%, 3,8 m | VÁLIDO |
| Águas Claras r1 | 7,8 | 44% | 736 m | 100% | 83% | 1,63 M / 151 | −20°, 0% | VÁLIDO |
| Águas Claras r2 | 12,2 | 65% | 696 m | 100% | 47% | 1,61 M / 122 | −20°, 0% | (b) draws, (c) |
| `drive-legacy` Hélio (caso conhecido) | 12,1 | 60% | 657 m | **0%** | **5%** | 1,33 M / 170 | −20° | (a), (c) |

Na hora padrão (17,5), o trânsito à vista ficou em 34–54% no Comercial e no Centro, abaixo dos 50% em 3 de
4 rodadas. A sessão real teve carro do trânsito na lista `visible` em 97% das amostras, e as rodadas na
cidade, em 62–82%. Essa régua do `visible` conta carro parado e longe (o legado no Hélio dá 93% nela e
5% no medidor), então a regra usa o medidor. As duas reprovações às 18h ficam perto dos limites e mudam
de réplica para réplica: no Comercial r2, mais trânsito deixou o carro mais lento; em Águas Claras r2, a
rota sorteada passou por uma vista com menos draws.

### Condição padrão e aceite do perfil `drive` (decisão da coordenação, 2026-10-25)

- **Condição padrão** de toda rodada `drive` do DDD 61: `--extra '&drive=1&hora=18'` (pico do trânsito)
  e, em Águas Claras, `--secs 220`. O aceite refeito do R1 usa exatamente isso.
- **Limites mantidos** (não afrouxar). Três réplicas por ponto (Comercial, Centro, Águas Claras); o ponto
  fecha com **pelo menos 2 de 3 válidas**. Cada inválida pode ser reposta por mais uma rodada, até 5 no
  total. Se ainda assim o ponto não fechar, registra-se a regra e quanto falta, e a decisão volta para a
  coordenação e o usuário.

### Aceite com réplicas (2026-10-25, export da engine 7c76eef3 + jogo 999b756, `&drive=1&hora=18`)

| ponto | rodadas (válida = V) | válidas | fecha? |
| --- | --- | --- | --- |
| Centro | V, V, I (14% > 9 m/s, 286 m) | 2 de 3 | sim |
| Águas Claras (`--secs 220`) | V, I (draws 122, trânsito 47%), I (24% > 9 m/s), I (39% > 9 m/s), V | 2 de 5 | sim |
| Comercial | V, I (31% > 9 m/s), I (29%, 380 m), I (trânsito 42%), I (trânsito 49%) | 1 de 5 | **não** |

O Comercial falha em duas regras, alternando entre elas. Na **velocidade**, falta ~10 pontos
percentuais (29–31% contra 40%), em rodadas com o trânsito do pico segurando o carro. No **trânsito à
vista (c)**, falta 1–8 pontos (42–49% contra 50%), nas rodadas em que ele andou rápido. Cidade (100%),
densidade (2,6–2,7 M tris, 136–174 draws) e câmera (−20°, 0% abaixo de −30°) passam com folga em todas.
A decisão volta para a coordenação e o usuário.

### Setor O no lugar do Comercial (decisão da coordenação, 2026-10-25)

O Comercial fica só no aceite a pé (`walk`). Os pontos de direção do aceite passam a ser Setor O, Centro
e Águas Claras. Setor O, com o mesmo export e as mesmas condições:

| rodada | > 9 m/s | caminho | trânsito (c) | veredito |
| --- | --- | --- | --- | --- |
| r1 | 38% | 428 m | 13% | velocidade, (c) |
| r2 | 54% | 535 m | 34% | (c) |
| r3 | 68% | 625 m | 16% | (c) |
| r4 | 51% | 512 m | 64% | VÁLIDO |
| r5 | 55% | 557 m | 21% | (c) |

1 válida de 5: não fecha. O percurso está certo: o carro sai alinhado na faixa (o spawn de frente para a
calçada não se repete) e dá voltas no miolo de Ceilândia (x −65..65, z 34..94), com cidade 100%, densidade
de 1,44–1,51 M tris e 151–172 draws, e câmera a −20° e 3,8 m. A regra que falha é a (c): faltam 16–37
pontos, porque nas ruas das quadras quase não passa carro do trânsito andando. Ele circula mais pelas
avenidas. A decisão volta para a coordenação e o usuário. Uma opção é o condutor preferir destinos
nas avenidas do bairro.
